"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, ExternalLink, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

interface BotItem {
  id: string;
  username: string;
  title: string;
  isActive: boolean;
  subscriberCount: number;
  tokenPrefix: string;
  webhookUrl: string | null;
  createdAt: string;
}

export default function BotsListPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tg-bots"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/tg/bots");
      return (r.data?.data ?? []) as BotItem[];
    },
  });

  const connect = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post("/admin/tg/bots", {
        token: token.trim(),
        title: title.trim() || undefined,
      });
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success("Бот подключён");
      setOpen(false);
      setToken("");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["tg-bots"] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message || "Не удалось подключить бота");
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Telegram-боты</h1>
          <p className="text-sm text-muted-foreground">
            Подключайте ботов, ведите подписчиков, запускайте сценарии и рассылки.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Подключить бота
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Пока нет подключённых ботов. Создайте бота через @BotFather и нажмите «Подключить бота».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((b) => (
            <Card key={b.id} className="hover:border-primary/40 transition">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-4 w-4" /> {b.title}
                    </CardTitle>
                    <CardDescription>@{b.username}</CardDescription>
                  </div>
                  <Badge variant={b.isActive ? "default" : "secondary"}>
                    {b.isActive ? "active" : "off"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{b.subscriberCount} подписчиков</span>
                </div>
                <div className="text-xs text-muted-foreground break-all">
                  token: {b.tokenPrefix}…
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/bots/${b.id}`} className="flex-1">
                    <Button variant="default" className="w-full">
                      Открыть
                    </Button>
                  </Link>
                  <a
                    href={`https://t.me/${b.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить Telegram-бота</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Токен от @BotFather</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AA..."
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Токен зашифровывается AES-256-GCM перед сохранением.
              </p>
            </div>
            <div>
              <Label>Название (необязательно)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Курс Прорыв — основной бот"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending || !token}>
                {connect.isPending ? "Подключаю..." : "Подключить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
