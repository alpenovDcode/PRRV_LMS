import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { parseCsv } from "@/lib/email/contacts/csv";
import { z } from "zod";

/**
 * POST /api/admin/marketing/contacts/import
 *
 * Импорт контактов из CSV. На входе FormData:
 *   - file:    File (text/csv)
 *   - mapping: JSON { email: "Email", name: "Name", tags: "Tags" } — какая колонка
 *              CSV маппится на какое поле. tags необязателен — если задан, его
 *              значение разбивается по `;` или `,` и добавляется к user.emailTags.
 *   - segmentId (optional): связать импорт с сегментом для аудита.
 *   - createMissing (optional, "true"|"false"): создавать новых пользователей с role=student
 *              или только обновлять существующих (default).
 *
 * Поведение:
 *   - email невалидный → skip с ошибкой в отчёт
 *   - email уже есть → MERGE: обновляем fullName (если был пустой) и добавляем теги
 *   - email отсутствует:
 *       - createMissing=false → skip с примечанием
 *       - createMissing=true  → создаём с временным паролем (не показываем в UI),
 *                                role=student, без emailValidated
 *
 * Возвращает: { rowsTotal, rowsImported, rowsSkipped, errors }
 */

const mappingSchema = z.object({
  email: z.string().min(1),
  name: z.string().optional(),
  tags: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const formData = await request.formData();
      const file = formData.get("file");
      const mappingRaw = formData.get("mapping");
      const segmentId = (formData.get("segmentId") as string | null) || null;
      const createMissing = formData.get("createMissing") === "true";

      if (!(file instanceof File)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Файл CSV не передан" } },
          { status: 400 }
        );
      }
      if (typeof mappingRaw !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Маппинг колонок не передан" } },
          { status: 400 }
        );
      }

      const mapping = mappingSchema.parse(JSON.parse(mappingRaw));
      const content = await file.text();
      const parsed = parseCsv(content);

      // Сверим что колонки маппинга есть в CSV.
      for (const [field, column] of Object.entries(mapping)) {
        if (!column) continue;
        if (!parsed.headers.includes(column as string)) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: `В CSV нет колонки "${column}" для поля "${field}"`,
              },
            },
            { status: 400 }
          );
        }
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const errors: Array<{ line: number; email?: string; message: string }> = [
        ...parsed.errors,
      ];
      let imported = 0;
      let skipped = 0;

      // Препроцессим и дедупим в памяти, чтобы не дёргать БД на дублях.
      const seen = new Set<string>();
      const records: Array<{ email: string; name: string | null; tags: string[]; line: number }> = [];

      parsed.rows.forEach((row, idx) => {
        const lineNumber = idx + 2; // +1 за header, +1 за 1-based
        const rawEmail = (row[mapping.email] || "").toLowerCase().trim();
        if (!rawEmail) {
          errors.push({ line: lineNumber, message: "Пустой email" });
          skipped++;
          return;
        }
        if (!emailRegex.test(rawEmail)) {
          errors.push({ line: lineNumber, email: rawEmail, message: "Невалидный формат email" });
          skipped++;
          return;
        }
        if (seen.has(rawEmail)) {
          errors.push({ line: lineNumber, email: rawEmail, message: "Дубль в CSV (уже встречался выше)" });
          skipped++;
          return;
        }
        seen.add(rawEmail);

        const name = mapping.name ? (row[mapping.name] || "").trim() || null : null;
        const tagsRaw = mapping.tags ? (row[mapping.tags] || "").trim() : "";
        const tags = tagsRaw
          ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
          : [];

        records.push({ email: rawEmail, name, tags, line: lineNumber });
      });

      // Достаём существующих пользователей пачкой.
      const emails = records.map((r) => r.email);
      const existing = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, fullName: true, emailTags: true },
      });
      const existingByEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

      // Обрабатываем по одному (транзакции не нужны — атомарность не критична для импорта).
      for (const rec of records) {
        const found = existingByEmail.get(rec.email);

        if (!found) {
          if (!createMissing) {
            errors.push({
              line: rec.line,
              email: rec.email,
              message: "Пользователь не найден в LMS (включите «создавать новых» чтобы добавлять)",
            });
            skipped++;
            continue;
          }
          errors.push({
            line: rec.line,
            email: rec.email,
            message: "Создание новых пользователей пока не реализовано (см. Спринт 1.5 TODO)",
          });
          skipped++;
          continue;
        }

        // MERGE: добавляем теги к существующим.
        const currentTags = Array.isArray(found.emailTags) ? (found.emailTags as string[]) : [];
        const mergedTags = Array.from(new Set([...currentTags, ...rec.tags]));

        await db.user.update({
          where: { id: found.id },
          data: {
            fullName: found.fullName || rec.name || undefined,
            emailTags: mergedTags.length > 0 ? mergedTags : undefined,
          },
        });
        imported++;
      }

      const importRecord = await db.emailContactImport.create({
        data: {
          fileName: file.name,
          rowsTotal: parsed.rows.length,
          rowsImported: imported,
          rowsSkipped: skipped,
          errors: errors.slice(0, 200), // ограничим, чтобы не раздувать JSON
          segmentId,
          createdBy: req.user!.userId,
        },
      });

      await logAction(req.user!.userId, "EMAIL_CONTACTS_IMPORT", "EmailContactImport", importRecord.id, {
        fileName: file.name,
        rowsTotal: parsed.rows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          importId: importRecord.id,
          rowsTotal: parsed.rows.length,
          rowsImported: imported,
          rowsSkipped: skipped,
          errors,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
