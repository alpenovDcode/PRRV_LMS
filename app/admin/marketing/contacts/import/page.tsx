"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCsv } from "@/lib/email/contacts/csv";

interface ImportResult {
  importId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  errors: Array<{ line: number; email?: string; message: string }>;
}

/**
 * UI импорта CSV в три шага:
 *   1. Выбрать файл (или drag&drop) — парсим клиентом, показываем preview
 *   2. Смаппить колонки на поля (email обязателен, name/tags опциональны)
 *   3. Загрузить — отдаём FormData на сервер, получаем отчёт
 */
export default function MarketingContactsImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState<string>("");
  const [createMissing, setCreateMissing] = useState(false);

  const [emailColumn, setEmailColumn] = useState<string>("");
  const [nameColumn, setNameColumn] = useState<string>("");
  const [tagsColumn, setTagsColumn] = useState<string>("");

  const preview = useMemo(() => {
    if (!content) return null;
    return parseCsv(content);
  }, [content]);

  const importMutation = useMutation<ImportResult>({
    mutationFn: async () => {
      if (!file) throw new Error("Файл не выбран");
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "mapping",
        JSON.stringify({ email: emailColumn, name: nameColumn || undefined, tags: tagsColumn || undefined })
      );
      fd.append("createMissing", createMissing ? "true" : "false");

      const r = await apiClient.post("/admin/marketing/contacts/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return r.data.data as ImportResult;
    },
    onSuccess: (res) => {
      toast.success(`Импортировано ${res.rowsImported} из ${res.rowsTotal}`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось импортировать";
      toast.error(msg);
    },
  });

  async function handleFile(f: File) {
    setFile(f);
    const text = await f.text();
    setContent(text);
    // Авто-подбор email-колонки.
    const parsed = parseCsv(text);
    const guess = parsed.headers.find((h) => /email|почта|mail/i.test(h));
    setEmailColumn(guess ?? parsed.headers[0] ?? "");
    const nameGuess = parsed.headers.find((h) => /name|имя|фио/i.test(h));
    setNameColumn(nameGuess ?? "");
    const tagsGuess = parsed.headers.find((h) => /tags|тег/i.test(h));
    setTagsColumn(tagsGuess ?? "");
  }

  const canImport = file && emailColumn && !importMutation.isPending;
  const result = importMutation.data;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/contacts"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку контактов
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Upload className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Импорт контактов</h1>
          <p className="text-gray-600">
            CSV с минимум колонкой email. Обновляет существующих пользователей: добавляет теги и
            (опционально) заполняет имя.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Файл CSV</CardTitle>
          <CardDescription>
            Поддерживаются разделители <code>,</code> и <code>;</code>, экранирование двойными
            кавычками, BOM (Excel-export).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <FileText className="h-10 w-10 mx-auto text-gray-400 mb-3" />
            <div className="text-sm font-medium text-gray-900">
              {file ? file.name : "Перетащите файл или кликните"}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {file
                ? `${(file.size / 1024).toFixed(1)} КБ · ${preview?.rows.length ?? 0} строк`
                : "Только .csv, до 50 МБ"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {preview && preview.headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Маппинг колонок</CardTitle>
            <CardDescription>
              Email обязателен. Имя и теги — опционально (если в CSV нет — оставьте пусто).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColumnPicker
                label="Email *"
                value={emailColumn}
                options={preview.headers}
                onChange={setEmailColumn}
                required
              />
              <ColumnPicker
                label="Имя"
                value={nameColumn}
                options={preview.headers}
                onChange={setNameColumn}
              />
              <ColumnPicker
                label="Теги (разделители: ; или ,)"
                value={tagsColumn}
                options={preview.headers}
                onChange={setTagsColumn}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={createMissing}
                onCheckedChange={(v) => setCreateMissing(v === true)}
                disabled
              />
              Создавать новых пользователей с role=student (отключено — будет в Спринте 1.5
              follow-up)
            </label>

            {preview.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.errors.length} {preview.errors.length === 1 ? "ошибка" : "ошибок"} парсинга
                </div>
                <ul className="mt-2 text-xs space-y-1 text-amber-700 max-h-32 overflow-y-auto">
                  {preview.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Строка {e.line}: {e.message}
                    </li>
                  ))}
                  {preview.errors.length > 20 && (
                    <li>и ещё {preview.errors.length - 20}…</li>
                  )}
                </ul>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-3 overflow-x-auto">
              <div className="text-xs font-medium text-gray-600 mb-2">
                Превью (первые 5 строк):
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    {preview.headers.map((h) => (
                      <th key={h} className="text-left px-2 py-1 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 whitespace-nowrap text-gray-700">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!canImport}
                onClick={() => importMutation.mutate()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {importMutation.isPending
                  ? "Импортируем…"
                  : `Импортировать ${preview.rows.length} строк`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Импорт завершён
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Всего строк" value={result.rowsTotal} />
              <Stat label="Импортировано" value={result.rowsImported} color="text-emerald-600" />
              <Stat label="Пропущено" value={result.rowsSkipped} color="text-amber-600" />
            </div>
            {result.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-amber-900">
                    Пропущенные строки ({result.errors.length})
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Показаны первые 50
                  </Badge>
                </div>
                <ul className="text-xs space-y-1 text-amber-800 max-h-64 overflow-y-auto">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      <strong>Строка {e.line}</strong>
                      {e.email && <span> · {e.email}</span>}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-2">
              <Link href="/admin/marketing/contacts">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />К списку контактов
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-gray-600">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      >
        {!required && <option value="">— не использовать —</option>}
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ label, value, color = "text-gray-900" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
