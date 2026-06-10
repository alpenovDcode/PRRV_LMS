"use client";

/**
 * /admin/bots/[botId]/google-sheets — настройка авто-экспорта подписчиков
 * в Google Sheets через Apps Script Web App (вебхук).
 *
 * Поток настройки для админа:
 *   1. Создать Google-таблицу.
 *   2. Расширения → Apps Script → вставить скрипт (кнопка «Скопировать»).
 *   3. Развернуть → Новое развёртывание → Веб-приложение → доступ
 *      «Кто угодно» → скопировать URL.
 *   4. Вставить URL сюда, включить, сохранить.
 *   5. «Проверить» — в таблице появится тестовая строка.
 *
 * После этого каждый новый подписчик автоматически попадает в таблицу.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  Sheet,
} from "lucide-react";

interface SheetColumn {
  field: string;
  header: string;
}

interface Config {
  enabled: boolean;
  webhookUrl: string | null;
  secret: string | null;
  columns: SheetColumn[];
  reexportTags: string[];
  lastOkAt: string | null;
  lastError: string | null;
}

const DEFAULT_COLUMNS: SheetColumn[] = [
  { field: "chatId", header: "Chat ID" },
  { field: "firstName", header: "Имя" },
  { field: "lastName", header: "Фамилия" },
  { field: "username", header: "Username" },
  { field: "field.email", header: "Email" },
  { field: "field.phone", header: "Телефон" },
  { field: "field.utm_source", header: "UTM source" },
  { field: "tags", header: "Теги" },
  { field: "subscribedAt", header: "Подписался" },
];

// Полный набор — паритет с CSV-выгрузкой. Кнопка «Добавить все поля».
const FULL_COLUMNS: SheetColumn[] = [
  { field: "chatId", header: "Chat ID" },
  { field: "username", header: "Username" },
  { field: "firstName", header: "Имя" },
  { field: "lastName", header: "Фамилия" },
  { field: "languageCode", header: "Язык" },
  { field: "field.email", header: "Email" },
  { field: "field.phone", header: "Телефон" },
  { field: "lmsEmail", header: "LMS email" },
  { field: "lmsName", header: "LMS ФИО" },
  { field: "tags", header: "Теги" },
  { field: "field.utm_source", header: "UTM source" },
  { field: "field.utm_medium", header: "UTM medium" },
  { field: "field.utm_campaign", header: "UTM campaign" },
  { field: "field.utm_content", header: "UTM content" },
  { field: "field.utm_term", header: "UTM term" },
  { field: "firstTouchSlug", header: "Первое касание (slug)" },
  { field: "firstTouchAt", header: "Первое касание (время)" },
  { field: "lastTouchSlug", header: "Последнее касание (slug)" },
  { field: "lastTouchAt", header: "Последнее касание (время)" },
  { field: "subscribedAt", header: "Подписался" },
  { field: "lastSeenAt", header: "Последняя активность" },
  { field: "isBlocked", header: "Заблокировал бота" },
  { field: "messagesIn", header: "Входящих" },
  { field: "messagesOut", header: "Исходящих" },
  { field: "journey", header: "Путь клиента (CJM)" },
  { field: "lastFlow", header: "Текущая воронка" },
  { field: "lastNode", header: "Текущий узел" },
];

const FIELD_HINTS = [
  "chatId",
  "username",
  "firstName",
  "lastName",
  "languageCode",
  "tags",
  "source",
  "lmsEmail",
  "lmsName",
  "firstTouchSlug",
  "firstTouchAt",
  "lastTouchSlug",
  "lastTouchAt",
  "subscribedAt",
  "lastSeenAt",
  "isBlocked",
  "messagesIn",
  "messagesOut",
  "journey",
  "lastFlow",
  "lastNode",
  "field.email",
  "field.phone",
  "field.utm_source",
  "field.<любое поле>",
  "var.<переменная>",
];

const APPS_SCRIPT = `// Apps Script для приёма строк от LMS и upsert по ключу (колонка A = chat_id).
// Вставьте в Расширения → Apps Script, разверните как Веб-приложение
// (доступ «Кто угодно»). Опционально задайте SECRET — он же в настройках LMS.
// Поддерживает и одиночную строку (realtime), и массив строк (массовая выгрузка).
const SECRET = ""; // если задан — LMS должна слать тот же секрет

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) {
      return ok({ error: "bad secret" });
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const headers = data.headers || [];

    // Заголовки в первой строке, если лист пуст.
    if (sheet.getLastRow() === 0 && headers.length) {
      sheet.appendRow(headers);
    }

    // Батч (массив строк) или одиночная строка.
    const rows = Array.isArray(data.rows)
      ? data.rows
      : (data.row ? [data.row] : []);
    if (!rows.length) return ok({ ok: true, written: 0 });

    // Карта существующих ключей (колонка A) → номер строки. Читаем один раз.
    const lastRow = sheet.getLastRow();
    const keyToRow = {};
    if (lastRow > 1) {
      const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < keys.length; i++) {
        keyToRow[String(keys[i][0])] = i + 2;
      }
    }

    const toAppend = [];
    for (var r = 0; r < rows.length; r++) {
      const row = rows[r];
      const key = String(row[0] || "");
      const found = key ? keyToRow[key] : 0;
      if (found) {
        sheet.getRange(found, 1, 1, row.length).setValues([row]);
      } else {
        toAppend.push(row);
        if (key) keyToRow[key] = sheet.getLastRow() + toAppend.length;
      }
    }
    if (toAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length)
        .setValues(toAppend);
    }
    return ok({ ok: true, written: rows.length });
  } catch (err) {
    return ok({ error: String(err) });
  }
}

function ok(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export default function GoogleSheetsPage() {
  const { botId } = useParams<{ botId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tg-gsheets", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/google-sheets`);
      return r.data?.data as Config;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [columns, setColumns] = useState<SheetColumn[]>(DEFAULT_COLUMNS);
  const [reexportTags, setReexportTags] = useState("");

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setWebhookUrl(data.webhookUrl ?? "");
    setSecret(data.secret ?? "");
    setColumns(data.columns?.length ? data.columns : DEFAULT_COLUMNS);
    setReexportTags((data.reexportTags ?? []).join(", "));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiClient.put(`/admin/tg/bots/${botId}/google-sheets`, {
        enabled,
        webhookUrl: webhookUrl.trim() || null,
        secret: secret.trim() || null,
        columns: columns.filter((c) => c.field.trim() && c.header.trim()),
        reexportTags: reexportTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["tg-gsheets", botId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error ?? "Не удалось сохранить"),
  });

  const test = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/google-sheets/test`
      );
      return r.data as { success: boolean; error?: string };
    },
    onSuccess: (d) => {
      if (d.success) toast.success("Тестовая строка отправлена — проверьте таблицу");
      else toast.error(`Ошибка: ${d.error ?? "неизвестно"}`);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error ?? "Ошибка проверки"),
  });

  const exportAll = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/google-sheets/export-all`
      );
      return r.data as {
        success: boolean;
        error?: string | null;
        data: { total: number; sent: number; failed: number };
      };
    },
    onSuccess: (d) => {
      if (d.success) {
        toast.success(
          `Выгружено ${d.data.sent} из ${d.data.total}${
            d.data.failed ? `, не дошло ${d.data.failed}` : ""
          }`
        );
        queryClient.invalidateQueries({ queryKey: ["tg-gsheets", botId] });
      } else {
        toast.error(`Ошибка: ${d.error ?? "неизвестно"}`);
      }
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error ?? "Ошибка массовой выгрузки"),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Загрузка…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Статус */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sheet className="h-6 w-6 text-emerald-600" />
            <div>
              <div className="font-medium">Авто-экспорт в Google Sheets</div>
              <div className="text-xs text-muted-foreground">
                Новый подписчик → строка в таблице сразу.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              enabled ? "bg-emerald-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </CardContent>
      </Card>

      {/* Инструкция + скрипт */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            1. Настройте таблицу (один раз)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Создайте Google-таблицу.</li>
            <li>
              Расширения → <b>Apps Script</b> → удалите код, вставьте скрипт
              ниже.
            </li>
            <li>
              <b>Развернуть</b> → Новое развёртывание → тип «Веб-приложение» →
              доступ <b>«Кто угодно»</b> → Развернуть → скопируйте URL.
            </li>
            <li>Вставьте URL в поле «Webhook URL» ниже.</li>
          </ol>
          <div className="relative">
            <pre className="max-h-60 overflow-auto text-[11px] font-mono bg-zinc-50 border border-zinc-200 rounded-lg p-3 whitespace-pre">
              {APPS_SCRIPT}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2 gap-1"
              onClick={() => {
                navigator.clipboard.writeText(APPS_SCRIPT);
                toast.success("Скрипт скопирован");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Копировать
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Конфиг */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">2. Подключение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Webhook URL (Apps Script Web App)</Label>
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfy.../exec"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">
              Секрет (необязательно — должен совпадать с SECRET в скрипте)
            </Label>
            <Input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="любая строка"
            />
          </div>
          <div>
            <Label className="text-xs">
              Пере-выгрузка по тегам (через запятую)
            </Label>
            <Input
              value={reexportTags}
              onChange={(e) => setReexportTags(e.target.value)}
              placeholder="оставил заявку, квалифицирован"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Когда подписчику добавляется такой тег — строка обновляется
              с актуальными данными (email/utm к тому моменту уже заполнены
              воронкой). Пусто = выгружаем только при первом /start.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Колонки */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">3. Колонки таблицы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Слева — поле подписчика, справа — заголовок колонки. Первая
            колонка <b>обязательно chatId</b> — это ключ upsert (по нему
            строка обновляется, а не дублируется).
          </p>
          {columns.map((col, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={col.field}
                onChange={(e) => {
                  const v = e.target.value;
                  setColumns((c) => {
                    const next = [...c];
                    next[idx] = { ...next[idx], field: v };
                    return next;
                  });
                }}
                placeholder="field.email"
                list="gs-fields"
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-gray-400">→</span>
              <input
                value={col.header}
                onChange={(e) => {
                  const v = e.target.value;
                  setColumns((c) => {
                    const next = [...c];
                    next[idx] = { ...next[idx], header: v };
                    return next;
                  });
                }}
                placeholder="Email"
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() =>
                  setColumns((c) => c.filter((_, i) => i !== idx))
                }
                className="p-1.5 text-gray-400 hover:text-red-500 rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <datalist id="gs-fields">
            {FIELD_HINTS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setColumns((c) => [...c, { field: "", header: "" }])
              }
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Колонка
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setColumns(FULL_COLUMNS)}
              className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              title="Заменить колонки полным набором — как в CSV-выгрузке подписчиков"
            >
              <Sheet className="h-3.5 w-3.5" /> Добавить все поля (как в CSV)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            «Все поля» включают язык, LMS-email/ФИО, касания, счётчики
            сообщений и путь клиента (CJM). Тяжёлые поля (сообщения, CJM)
            считаются при экспорте, могут чуть замедлить выгрузку.
          </p>
        </CardContent>
      </Card>

      {/* Статус последней отправки */}
      {data && (data.lastOkAt || data.lastError) && (
        <Card>
          <CardContent className="py-3 text-sm flex items-center gap-2">
            {data.lastError ? (
              <>
                <XCircle className="h-4 w-4 text-rose-600" />
                <span className="text-rose-700 break-all">
                  Последняя ошибка: {data.lastError.slice(0, 200)}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700">
                  Последняя успешная отправка:{" "}
                  {new Date(data.lastOkAt!).toLocaleString("ru-RU")}
                </span>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Массовая выгрузка текущей базы */}
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium text-sm">Выгрузить текущую базу</div>
            <div className="text-xs text-muted-foreground">
              Зальёт всех уже существующих подписчиков в таблицу одним
              разом (upsert по chat_id — дубли не создаются). Авто-экспорт
              новых работает отдельно.
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  "Выгрузить всю текущую базу подписчиков в таблицу? Существующие строки обновятся, новые добавятся."
                )
              ) {
                exportAll.mutate();
              }
            }}
            disabled={exportAll.isPending || !webhookUrl.trim()}
            className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          >
            {exportAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sheet className="h-4 w-4" />
            )}
            {exportAll.isPending ? "Выгружаю…" : "Выгрузить всю базу"}
          </Button>
        </CardContent>
      </Card>

      {/* Действия */}
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending || !webhookUrl.trim()}
          className="gap-1"
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Проверить
        </Button>
        {!enabled && (
          <Badge variant="secondary" className="ml-auto">
            экспорт выключен
          </Badge>
        )}
      </div>
    </div>
  );
}
