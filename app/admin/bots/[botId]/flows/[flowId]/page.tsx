"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, ArrowLeft, FileCode, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { FlowEditor } from "@/components/admin/tg/flow-editor/flow-editor";
import { flowGraphSchema, triggersSchema } from "@/lib/tg/flow-schema";
import type { FlowGraph, FlowTrigger } from "@/lib/tg/flow-schema";

interface FlowResponse {
  flow: {
    id: string;
    name: string;
    description: string | null;
    graph: unknown;
    triggers: unknown;
    isActive: boolean;
    totalEntered: number;
    totalCompleted: number;
  };
  recentRuns: Array<{
    id: string;
    status: string;
    currentNodeId: string | null;
    startedAt: string;
    finishedAt: string | null;
    subscriber: { firstName: string | null; lastName: string | null; username: string | null };
    lastError: string | null;
  }>;
}

interface FlowListItem {
  id: string;
  name: string;
}

export default function FlowEditorPage() {
  const params = useParams<{ botId: string; flowId: string }>();
  const { botId, flowId } = params;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tg-flow", botId, flowId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows/${flowId}`);
      return r.data?.data as FlowResponse;
    },
  });

  const { data: flowListData } = useQuery({
    queryKey: ["tg-flows", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows`);
      return (r.data?.data ?? []) as FlowListItem[];
    },
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Initial parsed graph + triggers, parsed once from the server response.
  const initial = useMemo(() => {
    if (!data?.flow) return null;
    const g = flowGraphSchema.safeParse(data.flow.graph);
    const t = triggersSchema.safeParse(data.flow.triggers ?? []);
    if (!g.success) {
      return {
        graph: null as FlowGraph | null,
        triggers: t.success ? t.data : [],
        graphRaw: data.flow.graph,
        triggersRaw: data.flow.triggers ?? [],
        error: g.error.message,
      };
    }
    return {
      graph: g.data,
      triggers: t.success ? t.data : [],
      graphRaw: data.flow.graph,
      triggersRaw: data.flow.triggers ?? [],
      error: null as string | null,
    };
  }, [data]);

  // Working copy from the visual editor.
  const [working, setWorking] = useState<{
    graph: FlowGraph;
    triggers: FlowTrigger[];
    warnings: string[];
  } | null>(null);

  // Raw-JSON fallback for unrecoverable graphs.
  const [rawMode, setRawMode] = useState(false);
  const [rawGraph, setRawGraph] = useState("");
  const [rawTriggers, setRawTriggers] = useState("");

  useEffect(() => {
    if (data?.flow) {
      setName(data.flow.name);
      setDescription(data.flow.description ?? "");
      setIsActive(data.flow.isActive);
      setRawGraph(JSON.stringify(data.flow.graph, null, 2));
      setRawTriggers(JSON.stringify(data.flow.triggers ?? [], null, 2));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name, description, isActive };
      if (rawMode) {
        let pg: unknown;
        let pt: unknown;
        try {
          pg = JSON.parse(rawGraph);
          pt = JSON.parse(rawTriggers);
        } catch (e) {
          throw new Error("Невалидный JSON");
        }
        body.graph = pg;
        body.triggers = pt;
      } else {
        if (!working) throw new Error("Граф не готов");
        if (working.warnings.length > 0) {
          throw new Error(`Есть ошибки: ${working.warnings.join("; ")}`);
        }
        body.graph = working.graph;
        body.triggers = working.triggers;
      }
      return apiClient.patch(`/admin/tg/bots/${botId}/flows/${flowId}`, body);
    },
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["tg-flow", botId, flowId] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        (e as Error)?.message ||
        "Ошибка сохранения";
      toast.error(msg);
    },
  });

  const flow = data?.flow;

  return (
    <div className="space-y-4">
      {/* Top toolbar */}
      <div className="flex items-center gap-2">
        <Link href={`/admin/bots/${botId}/flows`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> К списку
          </Button>
        </Link>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-md font-medium"
          placeholder="Название сценария"
        />
        <div className="flex-1" />
        <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "active" : "off"}</Badge>
        <Button variant="outline" onClick={() => setIsActive(!isActive)}>
          {isActive ? "Выключить" : "Включить"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRawMode((v) => !v)}
          title="Переключить режим редактирования"
        >
          <FileCode className="mr-2 h-4 w-4" />
          {rawMode ? "Визуальный" : "Raw JSON"}
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" /> Сохранить
        </Button>
      </div>

      {/* Stats / description card */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-3">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Описание</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание для команды"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Статистика</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div>
              Запусков: <b className="text-zinc-900">{flow?.totalEntered ?? 0}</b>
            </div>
            <div>
              Завершено: <b className="text-zinc-900">{flow?.totalCompleted ?? 0}</b>
            </div>
            {working && working.warnings.length > 0 && (
              <div className="pt-2 border-t border-amber-200 text-amber-700 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {working.warnings.length} ошибок валидации — см. правую панель
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invalid-graph banner */}
      {initial && initial.error && !rawMode && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-red-700">
                Граф не проходит валидацию
              </div>
              <div className="text-red-600 text-xs mt-1 font-mono whitespace-pre-wrap">
                {initial.error}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setRawMode(true)}>
              Открыть JSON-редактор
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {working && working.warnings.length > 0 && !rawMode && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3">
            <div className="font-semibold text-amber-700 flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4" /> Проблемы графа
            </div>
            <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
              {working.warnings.slice(0, 8).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {working.warnings.length > 8 && (
                <li>и ещё {working.warnings.length - 8}…</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Editor body */}
      {rawMode ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Граф (JSON)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={28}
                className="font-mono text-xs"
                spellCheck={false}
                value={rawGraph}
                onChange={(e) => setRawGraph(e.target.value)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Триггеры (JSON)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={28}
                className="font-mono text-xs"
                spellCheck={false}
                value={rawTriggers}
                onChange={(e) => setRawTriggers(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      ) : isLoading || !initial ? (
        <Card>
          <CardContent className="py-10 text-center text-zinc-400">
            Загрузка…
          </CardContent>
        </Card>
      ) : initial.graph ? (
        <FlowEditor
          graph={initial.graph}
          triggers={initial.triggers}
          flowList={flowListData ?? []}
          currentFlowId={flowId}
          onChange={setWorking}
        />
      ) : null}

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Последние запуски</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.recentRuns?.length ? (
            <div className="text-sm text-muted-foreground">пока пусто</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-2">Подписчик</th>
                  <th className="text-left p-2">Статус</th>
                  <th className="text-left p-2">Текущая нода</th>
                  <th className="text-left p-2">Стартовал</th>
                  <th className="text-left p-2">Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r) => {
                  const subName =
                    [r.subscriber.firstName, r.subscriber.lastName].filter(Boolean).join(" ") ||
                    r.subscriber.username ||
                    "—";
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">{subName}</td>
                      <td className="p-2">
                        <Badge variant="secondary">{r.status}</Badge>
                      </td>
                      <td className="p-2 font-mono">{r.currentNodeId ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(r.startedAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="p-2 text-destructive">{r.lastError ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
