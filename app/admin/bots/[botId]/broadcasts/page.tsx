"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, X } from "lucide-react";
import { toast } from "sonner";

interface Item {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  scheduled: "secondary",
  sending: "default",
  completed: "default",
  cancelled: "secondary",
  failed: "destructive",
};

export default function BroadcastsListPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["tg-broadcasts", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/broadcasts`);
      return (r.data?.data ?? []) as Item[];
    },
    refetchInterval: 5000,
  });

  const startMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.post(`/admin/tg/bots/${botId}/broadcasts/${id}`, { action: "start" }),
    onSuccess: () => {
      toast.success("Рассылка запущена");
      queryClient.invalidateQueries({ queryKey: ["tg-broadcasts", botId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.post(`/admin/tg/bots/${botId}/broadcasts/${id}`, { action: "cancel" }),
    onSuccess: () => {
      toast.success("Отменено");
      queryClient.invalidateQueries({ queryKey: ["tg-broadcasts", botId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/admin/bots/${botId}/broadcasts/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Новая рассылка
          </Button>
        </Link>
      </div>

      {!data?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Пока нет рассылок.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="text-left p-3">Название</th>
                  <th className="text-left p-3">Статус</th>
                  <th className="text-left p-3">Доставка</th>
                  <th className="text-left p-3">Создана</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{b.name}</td>
                    <td className="p-3">
                      <Badge variant={statusVariant[b.status] ?? "secondary"}>{b.status}</Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {b.sentCount}/{b.totalRecipients} ·{" "}
                      <span className="text-destructive">{b.failedCount} ошибок</span>
                      {b.blockedCount > 0 && (
                        <> · <span className="text-amber-600">{b.blockedCount} заблок.</span></>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString("ru-RU")}
                    </td>
                    <td className="p-3 text-right">
                      {b.status === "draft" && (
                        <Button size="sm" onClick={() => startMut.mutate(b.id)}>
                          <Play className="mr-1 h-3 w-3" /> Запустить
                        </Button>
                      )}
                      {(b.status === "scheduled" || b.status === "sending") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelMut.mutate(b.id)}
                        >
                          <X className="mr-1 h-3 w-3" /> Стоп
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
