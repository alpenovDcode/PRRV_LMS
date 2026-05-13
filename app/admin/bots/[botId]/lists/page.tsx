"use client";

// Lists page — CRUD for TgList entities used by broadcasts and as
// reactive trigger sources (list_joined / list_left).

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface List {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export default function ListsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tg-lists", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/lists`);
      return r.data?.data?.lists as List[];
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      apiClient.post(`/admin/tg/bots/${botId}/lists`, {
        name: name.trim(),
        icon: icon.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Список создан");
      setName("");
      setIcon("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["tg-lists", botId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message ?? "Ошибка"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/tg/bots/${botId}/lists/${id}`),
    onSuccess: () => {
      toast.success("Удалено");
      queryClient.invalidateQueries({ queryKey: ["tg-lists", botId] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-5 w-5" /> Списки подписчиков
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Сегменты пользователей для рассылок и реактивных триггеров
              (когда подписчик попадает в список — может запуститься воронка).
            </p>
          </div>
          {!creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Создать
            </Button>
          )}
        </CardHeader>
        {creating && (
          <CardContent className="border-t pt-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Название</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VIP-клиенты"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <Label>Иконка</Label>
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="⭐"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                Создать
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Отмена
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground">Загрузка…</div>}
      {!isLoading && data && data.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-6 text-center bg-zinc-50 rounded border">
          Пока ни одного списка. Создай первый, чтобы группировать подписчиков.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((list) => (
          <Card key={list.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-2xl shrink-0">{list.icon ?? "📂"}</div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{list.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="secondary" className="mr-1">
                      {list.memberCount}
                    </Badge>
                    подписчиков
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Удалить список «${list.name}»? Подписчики останутся.`)) {
                    remove.mutate(list.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
