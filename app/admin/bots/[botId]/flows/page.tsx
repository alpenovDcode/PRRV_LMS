"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  FileJson,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge as UIBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TEMPLATE_FLOWS, type FlowTemplate } from "@/lib/tg/flow-templates";

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  totalEntered: number;
  totalCompleted: number;
  updatedAt: string;
  triggers: any[];
}

export default function FlowsListPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [template, setTemplate] = useState<FlowTemplate>(TEMPLATE_FLOWS[0]);
  const [openImport, setOpenImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importName, setImportName] = useState("");
  // Salebot-импорт (отдельный канал — формат отличается от наших шаблонов).
  const [openSalebot, setOpenSalebot] = useState(false);
  const [salebotJson, setSalebotJson] = useState("");
  const [salebotReport, setSalebotReport] = useState<{
    createdFlow: { id: string; name: string };
    createdExtraFlows: Array<{ id: string; name: string }>;
    report: {
      totalNodes: number;
      totalConnections: number;
      mapped: Record<string, number>;
      unmapped: Array<{ salebotId: number; reason: string }>;
      triggers: number;
    };
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    name?: string;
    nodeCount?: number;
    triggerCount?: number;
    warnings?: Array<{ code: string; nodeId: string | null; message: string }>;
    dryRun?: boolean;
  } | null>(null);

  const { data } = useQuery({
    queryKey: ["tg-flows-list", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows`);
      return (r.data?.data ?? []) as FlowItem[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(`/admin/tg/bots/${botId}/flows`, {
        name: newName,
        graph: template.graph,
        triggers: template.triggers,
        description: template.description,
      });
      return r.data?.data;
    },
    onSuccess: (d) => {
      toast.success("Сценарий создан");
      setOpenNew(false);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["tg-flows-list", botId] });
      if (d?.id) window.location.href = `/admin/bots/${botId}/flows/${d.id}`;
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  const del = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/tg/bots/${botId}/flows/${id}`),
    onSuccess: () => {
      toast.success("Удалено");
      queryClient.invalidateQueries({ queryKey: ["tg-flows-list", botId] });
    },
  });

  // Скачивание JSON-экспорта — открываем endpoint в новой вкладке,
  // браузер отдаст файл благодаря Content-Disposition. Без axios,
  // потому что apiClient ставит accept: application/json и не умеет
  // в attachment-скачивание.
  const exportFlow = async (id: string) => {
    const res = await fetch(`/api/admin/tg/bots/${botId}/flows/${id}/export`, {
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Не удалось экспортировать");
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const filenameMatch = cd.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] ?? "flow.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importMut = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const r = await apiClient.post(`/admin/tg/bots/${botId}/flows/import`, {
        data: importJson,
        name: importName.trim() || undefined,
        dryRun,
      });
      return r.data?.data as {
        id?: string;
        name?: string;
        nodeCount: number;
        triggerCount: number;
        warnings: Array<{ code: string; nodeId: string | null; message: string }>;
        dryRun?: boolean;
      };
    },
    onSuccess: (d) => {
      setImportResult(d);
      if (d.id) {
        toast.success(
          `Сценарий «${d.name}» создан (выключен). Подключите медиа/listIds и активируйте.`
        );
        queryClient.invalidateQueries({ queryKey: ["tg-flows-list", botId] });
      } else if (d.dryRun) {
        toast.success(
          `Проверка ok: ${d.nodeCount} нод, ${d.triggerCount} триггеров${
            d.warnings.length ? `, замечаний: ${d.warnings.length}` : ""
          }`
        );
      }
    },
    onError: (
      e: Error & { response?: { data?: { error?: { message?: string } } } }
    ) => {
      toast.error(e?.response?.data?.error?.message ?? e.message);
    },
  });

  // Импорт Salebot JSON — отдельная конечная точка, формат сильно
  // отличается от нашего экспорта. Возвращает report с мэппингом.
  const salebotMut = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(salebotJson);
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/flows/import-salebot`,
        parsed
      );
      return r.data?.data;
    },
    onSuccess: (d) => {
      setSalebotReport(d);
      toast.success(
        `Импортирован основной flow + ${d.createdExtraFlows.length} реактивных. Сценарии созданы неактивными.`
      );
      queryClient.invalidateQueries({ queryKey: ["tg-flows-list", botId] });
    },
    onError: (
      e: Error & { response?: { data?: { error?: { message?: string } } } }
    ) => {
      toast.error(e?.response?.data?.error?.message ?? e.message);
    },
  });

  const handleSalebotFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ — проверьте экспорт из Salebot");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const txt = typeof reader.result === "string" ? reader.result : "";
      setSalebotJson(txt);
      setSalebotReport(null);
    };
    reader.readAsText(file);
  };

  const handleFileImport = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл больше 5 МБ — что-то не так с экспортом");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const txt = typeof reader.result === "string" ? reader.result : "";
      setImportJson(txt);
      setImportResult(null);
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setOpenImport(true);
            setImportJson("");
            setImportName("");
            setImportResult(null);
          }}
        >
          <Upload className="mr-2 h-4 w-4" /> Импорт
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setOpenSalebot(true);
            setSalebotJson("");
            setSalebotReport(null);
          }}
        >
          <FileJson className="mr-2 h-4 w-4" /> Импорт Salebot
        </Button>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-2 h-4 w-4" /> Новый сценарий
        </Button>
      </div>

      {!data?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Пока нет сценариев. Начните с шаблона.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((f) => (
            <Card key={f.id}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/admin/bots/${botId}/flows/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.name}
                    </Link>
                    {f.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {f.description}
                      </div>
                    )}
                  </div>
                  <Badge variant={f.isActive ? "default" : "secondary"}>
                    {f.isActive ? "active" : "off"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div>
                    запусков: {f.totalEntered} · завершено: {f.totalCompleted}
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/admin/bots/${botId}/flows/${f.id}`}>
                      <Button size="icon" variant="ghost" title="Редактировать">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => exportFlow(f.id)}
                      title="Скачать JSON-экспорт"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Удалить сценарий?")) del.mutate(f.id);
                      }}
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={openImport} onOpenChange={setOpenImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Импорт сценария</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Вставьте JSON-экспорт (получен через «Скачать JSON» у другого
              флоу) или загрузите файл. Импорт создаст{" "}
              <span className="font-medium">выключенный</span> сценарий —
              сначала проверьте медиа/listIds и goto_flow, потом активируйте.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileImport(f);
                  }}
                />
                <span className="inline-flex items-center gap-1 rounded border bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-muted">
                  <Upload className="h-4 w-4" /> Выбрать файл
                </span>
              </label>
              {importJson && (
                <span className="text-xs text-muted-foreground">
                  {importJson.length.toLocaleString("ru-RU")} байт
                </span>
              )}
            </div>
            <div>
              <Label>Имя в новом боте (опционально)</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="оставьте пустым, чтобы взять из экспорта"
              />
            </div>
            <div>
              <Label>JSON</Label>
              <Textarea
                rows={8}
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value);
                  setImportResult(null);
                }}
                placeholder='{"formatVersion": 1, ...}'
                className="font-mono text-xs"
              />
            </div>
            {importResult && (
              <div className="rounded border bg-muted/30 p-3 space-y-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  <UIBadge variant="outline">
                    Нод: <span className="font-mono ml-1">{importResult.nodeCount}</span>
                  </UIBadge>
                  <UIBadge variant="outline">
                    Триггеров: <span className="font-mono ml-1">{importResult.triggerCount}</span>
                  </UIBadge>
                  {importResult.warnings && importResult.warnings.length > 0 && (
                    <UIBadge className="bg-amber-100 text-amber-800 border-amber-300">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      Замечаний: {importResult.warnings.length}
                    </UIBadge>
                  )}
                </div>
                {importResult.warnings && importResult.warnings.length > 0 && (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.warnings.map((w, i) => (
                      <li key={i} className="text-amber-700">
                        <span className="font-mono text-[10px] mr-1">[{w.code}]</span>
                        {w.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenImport(false)}>
                Закрыть
              </Button>
              <Button
                variant="outline"
                disabled={!importJson || importMut.isPending}
                onClick={() => importMut.mutate(true)}
              >
                Проверить
              </Button>
              <Button
                disabled={!importJson || importMut.isPending}
                onClick={() => importMut.mutate(false)}
              >
                {importMut.isPending ? "Импорт…" : "Импортировать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openSalebot} onOpenChange={setOpenSalebot}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Импорт воронки из Salebot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Загрузите JSON-выгрузку воронки из Salebot (Файл → Экспорт). Мы
              создадим один главный сценарий + по одному на каждый
              реактивный триггер (link_clicked, external_event, unsubscribed).
              Сценарии создаются <strong>неактивными</strong> — проверьте
              маппинг в редакторе и активируйте вручную.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".json,application/json"
                id="salebot-file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSalebotFile(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("salebot-file")?.click()}
              >
                <Upload className="mr-1 h-3 w-3" /> Выбрать файл
              </Button>
              {salebotJson && (
                <span className="text-xs text-muted-foreground">
                  Загружено {Math.round(salebotJson.length / 1024)} KB
                </span>
              )}
            </div>
            <Textarea
              rows={6}
              value={salebotJson}
              onChange={(e) => setSalebotJson(e.target.value)}
              placeholder='Либо вставьте JSON сюда: {"messages":[…], "connections":[…]}'
              className="font-mono text-xs"
            />
            {salebotReport && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs space-y-2">
                <div className="font-medium text-emerald-900">
                  Главный сценарий: «{salebotReport.createdFlow.name}»
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-emerald-800">
                  <div>
                    Сообщений:{" "}
                    <b>{salebotReport.report.mapped.message ?? 0}</b>
                  </div>
                  <div>
                    HTTP-нод: <b>{salebotReport.report.mapped.http ?? 0}</b>
                  </div>
                  <div>
                    Заметок: <b>{salebotReport.report.mapped.note ?? 0}</b>
                  </div>
                  <div>
                    Реактивных flows:{" "}
                    <b>{salebotReport.createdExtraFlows.length}</b>
                  </div>
                </div>
                {salebotReport.report.unmapped.length > 0 && (
                  <div className="mt-2 text-amber-800">
                    Не замаплено: {salebotReport.report.unmapped.length} —
                    проверьте редактор.
                  </div>
                )}
                {salebotReport.createdExtraFlows.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-emerald-900 font-medium">
                      Реактивные сценарии (
                      {salebotReport.createdExtraFlows.length})
                    </summary>
                    <ul className="mt-1 ml-4 list-disc">
                      {salebotReport.createdExtraFlows.map((f) => (
                        <li key={f.id}>{f.name}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenSalebot(false)}>
                Закрыть
              </Button>
              <Button
                onClick={() => salebotMut.mutate()}
                disabled={!salebotJson.trim() || salebotMut.isPending}
              >
                {salebotMut.isPending ? "Импорт…" : "Импортировать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый сценарий</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Название</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label>Шаблон</Label>
              <select
                className="w-full mt-1 rounded border px-2 py-2 text-sm"
                value={template.id}
                onChange={(e) =>
                  setTemplate(TEMPLATE_FLOWS.find((t) => t.id === e.target.value) ?? TEMPLATE_FLOWS[0])
                }
              >
                {TEMPLATE_FLOWS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenNew(false)}>
                Отмена
              </Button>
              <Button
                onClick={() => create.mutate()}
                disabled={!newName.trim() || create.isPending}
              >
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
