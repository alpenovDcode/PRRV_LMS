"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  UserPlus,
  ShoppingCart,
  Moon,
  CheckCheck,
} from "lucide-react";

const TRIGGER_META: Record<
  string,
  { label: string; icon: typeof Workflow; color: string }
> = {
  user_registered: {
    label: "Регистрация",
    icon: UserPlus,
    color: "bg-blue-50 text-blue-600",
  },
  course_purchased: {
    label: "Покупка курса",
    icon: ShoppingCart,
    color: "bg-emerald-50 text-emerald-600",
  },
  inactive_30d: {
    label: "Неактивность",
    icon: Moon,
    color: "bg-purple-50 text-purple-600",
  },
  course_completed: {
    label: "Завершение курса",
    icon: CheckCheck,
    color: "bg-amber-50 text-amber-600",
  },
};

interface AutomationRow {
  id: string;
  name: string;
  trigger: string;
  steps: Array<{ delayHours: number; templateId: string; label?: string }>;
  isActive: boolean;
  stats: Record<string, number> | null;
  updatedAt: string;
  _count: { runs: number };
}

export default function MarketingAutomationsListPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-automations"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/automations");
      return r.data.data as { items: AutomationRow[] };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => {
      await apiClient.post(`/admin/marketing/automations/${vars.id}/toggle`, {
        isActive: vars.isActive,
      });
    },
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? "Автоматизация включена" : "Автоматизация выключена");
      queryClient.invalidateQueries({ queryKey: ["marketing-automations"] });
    },
    onError: () => toast.error("Не удалось изменить статус"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/marketing/automations/${id}`);
    },
    onSuccess: () => {
      toast.success("Автоматизация удалена");
      queryClient.invalidateQueries({ queryKey: ["marketing-automations"] });
    },
    onError: () => toast.error("Не удалось удалить"),
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center">
            <Workflow className="h-6 w-6 text-pink-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Автоматизации</h1>
            <p className="text-gray-600">
              Триггерные цепочки писем. Запускаются по событию (регистрация, покупка) или
              периодической проверке (неактивность).
            </p>
          </div>
        </div>
        <Link href="/admin/marketing/automations/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Новая автоматизация
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Workflow className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <div className="text-sm text-gray-500">Автоматизаций пока нет</div>
            <Link href="/admin/marketing/automations/new">
              <Button variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Создать первую
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((a) => {
            const meta =
              TRIGGER_META[a.trigger] ?? {
                label: a.trigger,
                icon: Workflow,
                color: "bg-gray-100 text-gray-700",
              };
            const Icon = meta.icon;
            const stats = a.stats ?? {};

            return (
              <Card key={a.id} className={a.isActive ? "" : "opacity-70"}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${meta.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{a.name}</CardTitle>
                        <CardDescription>
                          Триггер: {meta.label} · {a.steps.length} шагов
                        </CardDescription>
                      </div>
                    </div>
                    {a.isActive ? (
                      <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        Включена
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Выключена</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Stat label="Активных runs" value={a._count.runs} />
                    <Stat label="Шагов отправлено" value={stats.stepsSent ?? 0} />
                    <Stat label="Завершено runs" value={stats.completedRuns ?? 0} />
                  </div>

                  <div className="flex gap-1 pt-2 border-t border-gray-100">
                    <Link href={`/admin/marketing/automations/${a.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-2">
                        <Pencil className="h-3 w-3" />
                        Редактировать
                      </Button>
                    </Link>
                    <Button
                      variant={a.isActive ? "outline" : "default"}
                      size="sm"
                      className="gap-2"
                      disabled={toggleMutation.isPending}
                      onClick={() =>
                        toggleMutation.mutate({ id: a.id, isActive: !a.isActive })
                      }
                    >
                      {a.isActive ? (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            a._count.runs > 0
                              ? `У автоматизации ${a._count.runs} активных запусков. Удалить?`
                              : `Удалить «${a.name}»?`
                          )
                        ) {
                          deleteMutation.mutate(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
