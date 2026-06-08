"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ImportResp {
  dryRun: boolean;
  /** "standard" — наш формат, "salebot" — авто-конверт из SaleBot. */
  format: "standard" | "salebot";
  totalRows: number;
  /** Сколько строк дошло до импорта после SaleBot-маппинга (если он сработал). */
  mappedRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; chatId?: string; message: string }>;
  errorsTotal: number;
  delimiter: "," | ";";
  headers: string[];
}

export default function ImportSubscribersPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;

  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResp | null>(null);
  const [lastWasDryRun, setLastWasDryRun] = useState(false);

  const submit = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/subscribers/import-csv`,
        { csv, dryRun }
      );
      return r.data?.data as ImportResp;
    },
    onSuccess: (d, dryRun) => {
      setResult(d);
      setLastWasDryRun(dryRun);
      if (!dryRun) {
        toast.success(
          `Импорт завершён: создано ${d.created}, обновлено ${d.updated}, пропущено ${d.skipped}`
        );
      }
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e?.response?.data?.error?.message ?? "Ошибка импорта");
    },
  });

  const onFileChange = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл больше 5 МБ. Разбейте на части.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const txt = typeof reader.result === "string" ? reader.result : "";
      setCsv(txt);
      setResult(null);
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers`)}
        >
          <ArrowLeft className="h-4 w-4" /> к подписчикам
        </Button>
        <h1 className="text-xl font-semibold">Импорт подписчиков из CSV</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Формат CSV</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            Первая строка — <span className="font-medium">заголовок</span>.
            Колонки можно ставить в любом порядке, регистр не важен.
            Разделитель — запятая или точка с запятой (определяется
            автоматически).
          </div>
          <div className="rounded border bg-zinc-50 p-3 font-mono text-xs whitespace-pre overflow-x-auto">
{`chatId,firstName,lastName,username,languageCode,tags,customFields
123456789,Иван,Петров,ivan_p,ru,vip;promo2025,age=25;city=Moscow
987654321,Анна,,anna_x,en,vip,age=31`}
          </div>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>
              <code>chatId</code> — обязательное поле, числовой Telegram-id
            </li>
            <li>
              <code>tags</code> — теги через <code>;</code> или <code>|</code>,
              существующие теги <span className="font-medium">не затираются</span>
            </li>
            <li>
              <code>customFields</code> — пары <code>ключ=значение</code> через{" "}
              <code>;</code>, новые ключи поверх старых
            </li>
            <li>
              Сначала запустите <span className="font-medium">сухой прогон</span> —
              увидите ошибки до того, как изменения попадут в базу
            </li>
          </ul>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
            <div className="font-medium">
              📥 Выгрузка из SaleBot — распознаётся автоматически
            </div>
            <div>
              Если ваш CSV из SaleBot (колонка{" "}
              <code className="bg-white px-1 rounded">
                Идентификатор внутри мессенджера
              </code>
              ) — мы сами замэппим: ID, имя, @username, UTM, email, phone,
              теги, метки и списки попадут в карточку подписчика. Строки с
              мессенджером, отличным от Telegram, скипнутся (отчёт покажет).
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            <div className="font-medium flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Важно про Telegram
            </div>
            <div>
              Импорт кладёт записи в БД. Но Telegram <b>не разрешает боту
              первым писать пользователю</b> — пока импортированный
              подписчик сам не нажмёт <code>/start</code> у этого бота,
              рассылка ему не уйдёт (Telegram вернёт «bot can't initiate
              conversation»). До этого момента записи годны для аналитики,
              сегментации и синка в CRM. Исключение — если вы импортируете
              CSV в <b>тот же самый бот</b>, с которого выгрузка.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV-файл</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileChange(f);
                }}
              />
              <span className="inline-flex items-center gap-1 rounded border bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" /> Выбрать файл
              </span>
            </label>
            {csv && (
              <span className="text-xs text-muted-foreground">
                <FileText className="inline h-3 w-3" /> {csv.length.toLocaleString("ru-RU")} байт
              </span>
            )}
          </div>
          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
            placeholder="…или вставьте CSV сюда"
            rows={10}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!csv || submit.isPending}
              onClick={() => submit.mutate(true)}
            >
              Сухой прогон
            </Button>
            <Button
              disabled={!csv || submit.isPending}
              onClick={() => submit.mutate(false)}
            >
              {submit.isPending ? "Импорт…" : "Импортировать"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card
          className={
            result.errorsTotal > 0
              ? "border-amber-400 bg-amber-50/40"
              : "border-emerald-400 bg-emerald-50/40"
          }
        >
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.errorsTotal > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              {lastWasDryRun ? "Результат сухого прогона" : "Импорт завершён"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {result.format === "salebot" && (
                <Badge className="bg-purple-600">SaleBot CSV</Badge>
              )}
              <Badge variant="outline">
                Всего строк: <span className="ml-1 font-mono">{result.totalRows}</span>
              </Badge>
              {result.format === "salebot" && result.mappedRows !== result.totalRows && (
                <Badge variant="outline">
                  Пригодных к импорту:{" "}
                  <span className="ml-1 font-mono">{result.mappedRows}</span>
                </Badge>
              )}
              <Badge variant="default" className="bg-emerald-600">
                Создано: {result.created}
              </Badge>
              <Badge className="bg-blue-600">
                Обновлено: {result.updated}
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="destructive">Пропущено: {result.skipped}</Badge>
              )}
              <Badge variant="outline">
                Разделитель: <code className="ml-1">{result.delimiter}</code>
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Распознанные колонки: {result.headers.join(", ") || "—"}
            </div>
            {result.errorsTotal > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-amber-700">
                  Ошибки ({result.errorsTotal}, показано {result.errors.length}):
                </div>
                <div className="max-h-64 overflow-y-auto rounded border bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-2 py-1 text-left">Строка</th>
                        <th className="px-2 py-1 text-left">chatId</th>
                        <th className="px-2 py-1 text-left">Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 font-mono">{e.row}</td>
                          <td className="px-2 py-1 font-mono">{e.chatId ?? "—"}</td>
                          <td className="px-2 py-1">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!lastWasDryRun && (
              <Button
                variant="outline"
                onClick={() => router.push(`/admin/bots/${botId}/subscribers`)}
              >
                Перейти к подписчикам
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
