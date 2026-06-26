"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Workflow, Power, PowerOff } from "lucide-react";
import {
  AutomationEditor,
  type AutomationFormData,
  type AutomationStepUI,
} from "../../_components/automation-editor";

interface AutomationDetail {
  id: string;
  name: string;
  trigger: string;
  triggerData: Record<string, unknown> | null;
  steps: AutomationStepUI[];
  isActive: boolean;
  stats: Record<string, number> | null;
  runs: Array<{
    id: string;
    userId: string;
    currentStep: number;
    nextStepAt: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    user: { id: string; email: string; fullName: string | null } | null;
  }>;
}

const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "Выполняется", color: "bg-amber-50 text-amber-700" },
  completed: { label: "Завершён", color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Отменён", color: "bg-gray-100 text-gray-600" },
  failed: { label: "Ошибка", color: "bg-red-50 text-red-700" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MarketingAutomationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-automation", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/automations/${id}`);
      return r.data.data as AutomationDetail;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (form: AutomationFormData) => {
      await apiClient.patch(`/admin/marketing/automations/${id}`, form);
    },
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["marketing-automation", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing-automations"] });
    },
    onError: () => toast.error("Не удалось сохранить"),
  });

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      await apiClient.post(`/admin/marketing/automations/${id}/toggle`, { isActive });
    },
    onSuccess: (_, isActive) => {
      toast.success(isActive ? "Включена" : "Выключена");
      queryClient.invalidateQueries({ queryKey: ["marketing-automation", id] });
    },
    onError: () => toast.error("Не удалось изменить статус"),
  });

  if (isLoading) {
    return <div className="container mx-auto max-w-5xl px-4 py-8 text-gray-500">Загрузка…</div>;
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Link href="/admin/marketing/automations" className="text-sm text-gray-600 hover:text-gray-900">
          ← К списку
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-gray-500">Автоматизация не найдена</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/automations"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center">
            <Workflow className="h-6 w-6 text-pink-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{data.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {data.isActive ? (
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  Включена
                </Badge>
              ) : (
                <Badge variant="secondary">Выключена</Badge>
              )}
              <span className="text-sm text-gray-600">{data.steps.length} шагов</span>
            </div>
          </div>
        </div>
        <Button
          variant={data.isActive ? "outline" : "default"}
          onClick={() => toggleMutation.mutate(!data.isActive)}
          disabled={toggleMutation.isPending}
          className="gap-2"
        >
          {data.isActive ? (
            <>
              <PowerOff className="h-4 w-4" />
              Выключить
            </>
          ) : (
            <>
              <Power className="h-4 w-4" />
              Включить
            </>
          )}
        </Button>
      </div>

      <AutomationEditor
        initialData={{
          name: data.name,
          trigger: data.trigger,
          triggerData: data.triggerData ?? {},
          steps: data.steps,
        }}
        submitLabel="Сохранить изменения"
        isSubmitting={updateMutation.isPending}
        onSubmit={(form) => updateMutation.mutate(form)}
      />

      {data.runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Последние 20 запусков</CardTitle>
            <CardDescription>
              Видно кто получает цепочку и на каком шаге. Помогает дебажить.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Пользователь</th>
                    <th className="px-4 py-3 text-left">Шаг</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="px-4 py-3 text-left">Старт</th>
                    <th className="px-4 py-3 text-left">Следующий / завершён</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.runs.map((run) => {
                    const meta = RUN_STATUS_META[run.status] ?? RUN_STATUS_META.failed;
                    return (
                      <tr key={run.id}>
                        <td className="px-4 py-3">
                          {run.user ? (
                            <Link
                              href={`/admin/marketing/contacts/${run.user.id}`}
                              className="text-gray-900 hover:text-pink-600"
                            >
                              {run.user.email}
                            </Link>
                          ) : (
                            <span className="text-gray-500">{run.userId}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {run.currentStep + 1} / {data.steps.length}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={meta.color}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmt(run.startedAt)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {run.completedAt ? fmt(run.completedAt) : fmt(run.nextStepAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
