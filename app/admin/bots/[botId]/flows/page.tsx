"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
                      <Button size="icon" variant="ghost">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Удалить сценарий?")) del.mutate(f.id);
                      }}
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
