import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parseCsv } from "@/lib/tg/csv-parse";
import { adaptSalebotCsv } from "@/lib/tg/csv-salebot-adapter";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Максимум 10 000 строк за один импорт. Больше — пусть админ разбивает
// на батчи, чтобы не уронить веб-процесс длинной транзакцией.
const MAX_ROWS = 10_000;

// Импорт списка подписчиков из CSV. Поддерживаются 2 формата:
//
// 1. Стандартный (наш) — колонки (case-insensitive, в любом порядке):
//      chatId      — telegram numeric id (required, integer)
//      firstName   — имя
//      lastName    — фамилия
//      username    — телеграм-username (без @)
//      languageCode — код языка (ru, en)
//      tags        — теги через `;` или `|`, например `vip;promo2025`
//      customFields — пары `ключ=значение`, разделённые `;`, например
//                     `age=25;city=Moscow`
//
// 2. SaleBot CSV (выгрузка из SaleBot) — детектируется автоматически по
//    наличию колонки «Идентификатор внутри мессенджера». Адаптер
//    в lib/tg/csv-salebot-adapter.ts превращает её строки в стандартный
//    формат + добавляет тег `imported:salebot` и `salebot:<bot_name>` для
//    последующей фильтрации. Строки с мессенджером, отличным от Telegram,
//    автоматически скипаются (и попадают в errors[] с пометкой SaleBot).
//
// Поведение:
//   match by (botId, chatId)
//   • если найден — обновляем поля (имя/фамилия/username/lang) + мержим
//     теги (объединение) + мержим customFields (новые ключи поверх старых)
//   • если не найден — создаём с tgUserId = chatId (для импорта это
//     допустимо — позже он подтянется из апдейтов)
//
// ВАЖНО — про Telegram API: импорт кладёт записи в БД и связывает их по
// chat_id. Но первым писать пользователю боту нельзя — это ограничение
// Telegram. Поэтому пока импортированный подписчик сам не нажмёт /start
// у этого бота, sendMessage вернёт `Forbidden: bot can't initiate
// conversation with a user`. Рассылки полетят только тем, кто пришёл
// сам. До этого момента запись пригодна для аналитики, сегментации,
// синка в CRM (Bitrix24), но не для исходящих сообщений в TG.
//
// Возвращает: { created, updated, skipped, errors[], format }
//
// dryRun=true — ничего не пишет, только возвращает что бы случилось.
const inputSchema = z.object({
  csv: z.string().min(1).max(5_000_000), // <=5MB raw text
  dryRun: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const { csv, dryRun } = parsed.data;

      const bot = await db.tgBot.findUnique({ where: { id: params.botId } });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Bot not found" } },
          { status: 404 }
        );
      }

      const parsedCsv = parseCsv(csv);
      if (parsedCsv.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "EMPTY_CSV", message: "CSV не содержит строк данных" },
          },
          { status: 400 }
        );
      }
      if (parsedCsv.rows.length > MAX_ROWS) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TOO_MANY_ROWS",
              message: `Максимум ${MAX_ROWS} строк за импорт, у вас ${parsedCsv.rows.length}`,
            },
          },
          { status: 400 }
        );
      }

      // ── SaleBot CSV: автоматическое распознавание + конвертация ─────────
      // Если в заголовке колонка «Идентификатор внутри мессенджера» — это
      // выгрузка SaleBot. Преобразуем её строки в наш стандартный формат
      // (chatId/firstName/lastName/username/tags/customFields), а после
      // импорта добавим в отчёт информацию про скипнутые строки (другие
      // мессенджеры, пустой chat_id).
      let effectiveHeaders = parsedCsv.headers;
      let effectiveRows = parsedCsv.rows;
      let salebotSkipped: Array<{ row: number; reason: string }> = [];
      let formatDetected: "standard" | "salebot" = "standard";
      const salebotAdapt = adaptSalebotCsv({
        headers: parsedCsv.headers,
        rows: parsedCsv.rows,
      });
      if (salebotAdapt) {
        formatDetected = "salebot";
        effectiveHeaders = salebotAdapt.headers;
        effectiveRows = salebotAdapt.rows;
        salebotSkipped = salebotAdapt.skipped;
      }

      // Нормализуем заголовки в lower-case для подбора нечувствительного к регистру.
      const headerMap = new Map<string, string>();
      for (const h of effectiveHeaders) {
        headerMap.set(h.toLowerCase(), h);
      }
      const getCol = (
        row: Record<string, string>,
        key: string
      ): string | undefined => {
        const orig = headerMap.get(key.toLowerCase());
        if (!orig) return undefined;
        const v = row[orig];
        return v === "" ? undefined : v;
      };

      // Pre-fetch existing subscribers by chatId (one DB hit, не N+1).
      const chatIds: string[] = [];
      for (const r of effectiveRows) {
        const ci = getCol(r, "chatId");
        if (ci) chatIds.push(String(ci).trim());
      }
      const existing = await db.tgSubscriber.findMany({
        where: { botId: params.botId, chatId: { in: chatIds } },
        select: { id: true, chatId: true, tags: true, customFields: true },
      });
      const existingMap = new Map<
        string,
        { id: string; tags: string[]; customFields: Prisma.JsonValue }
      >();
      for (const s of existing) {
        existingMap.set(s.chatId, {
          id: s.id,
          tags: s.tags,
          customFields: s.customFields,
        });
      }

      type RowError = { row: number; chatId?: string; message: string };
      const errors: RowError[] = [];
      const toCreate: Prisma.TgSubscriberCreateManyInput[] = [];
      const toUpdate: Array<{
        id: string;
        data: Prisma.TgSubscriberUpdateInput;
      }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (let idx = 0; idx < effectiveRows.length; idx++) {
        const row = effectiveRows[idx];
        const rowNum = idx + 2; // +1 for header, +1 for 1-based numbering
        const chatId = getCol(row, "chatId");
        if (!chatId) {
          errors.push({ row: rowNum, message: "пустой chatId" });
          skipped++;
          continue;
        }
        if (!/^-?\d{1,32}$/.test(chatId)) {
          errors.push({ row: rowNum, chatId, message: "chatId должен быть числом" });
          skipped++;
          continue;
        }

        const firstName = getCol(row, "firstName");
        const lastName = getCol(row, "lastName");
        const username = getCol(row, "username")?.replace(/^@/, "");
        const languageCode = getCol(row, "languageCode");

        const tagsRaw = getCol(row, "tags") ?? "";
        const tags = tagsRaw
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean);

        const cfRaw = getCol(row, "customFields") ?? "";
        const customFields: Record<string, string> = {};
        for (const pair of cfRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
          const eq = pair.indexOf("=");
          if (eq > 0) {
            const k = pair.slice(0, eq).trim();
            const v = pair.slice(eq + 1).trim();
            if (k) customFields[k] = v;
          }
        }

        const existingRow = existingMap.get(chatId);
        if (existingRow) {
          const mergedTags = Array.from(new Set([...existingRow.tags, ...tags]));
          const mergedFields = {
            ...((existingRow.customFields as Record<string, unknown>) ?? {}),
            ...customFields,
          };
          toUpdate.push({
            id: existingRow.id,
            data: {
              firstName: firstName ?? undefined,
              lastName: lastName ?? undefined,
              username: username ?? undefined,
              languageCode: languageCode ?? undefined,
              tags: { set: mergedTags },
              customFields: mergedFields as Prisma.InputJsonValue,
            },
          });
          updated++;
        } else {
          toCreate.push({
            botId: params.botId,
            chatId,
            tgUserId: chatId,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            username: username ?? null,
            languageCode: languageCode ?? null,
            tags,
            customFields: customFields as Prisma.InputJsonValue,
          });
          created++;
        }
      }

      if (!dryRun) {
        if (toCreate.length > 0) {
          await db.tgSubscriber.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }
        // Updates обрабатываем по-одиночке (но в Promise.all-батчах по 50),
        // т.к. createMany поверх update не работает в Prisma.
        const BATCH = 50;
        for (let i = 0; i < toUpdate.length; i += BATCH) {
          const slice = toUpdate.slice(i, i + BATCH);
          await Promise.all(
            slice.map((u) =>
              db.tgSubscriber.update({ where: { id: u.id }, data: u.data })
            )
          );
        }
      }

      // SaleBot-скипы (другой мессенджер, пустой chat_id, не-число)
      // подмешиваем к errors[] с понятной отметкой формата, чтобы
      // отчёт в UI был полный.
      const fmtErrors = [
        ...salebotSkipped.map((s) => ({
          row: s.row,
          message: `SaleBot: ${s.reason}`,
        })),
        ...errors,
      ];
      const totalSkipped = skipped + salebotSkipped.length;

      return NextResponse.json({
        success: true,
        data: {
          dryRun,
          format: formatDetected,
          totalRows: parsedCsv.rows.length,
          mappedRows: effectiveRows.length,
          created,
          updated,
          skipped: totalSkipped,
          errors: fmtErrors.slice(0, 100), // не сливать клиенту тысячи ошибок
          errorsTotal: fmtErrors.length,
          delimiter: parsedCsv.delimiter,
          headers: effectiveHeaders,
        },
      });
    },
    { roles: ["admin"] }
  );
}
