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
import { Bot, Plus, ExternalLink, Users as UsersIcon, Copy, Eye } from "lucide-react";
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
  /** "webhook" (стандарт) | "forwarded" (LMS только наблюдает). */
  connectionMode?: "webhook" | "forwarded";
}

type ConnectMode = "webhook" | "forwarded";

/**
 * Возвращается из POST /admin/tg/bots после успешного подключения.
 * Для forwarded режима ДОБАВЛЯЕТ webhookSecret — он показывается админу
 * ОДИН РАЗ для копирования в env внешнего бэка.
 */
interface ConnectedBot {
  id: string;
  username: string;
  title: string;
  webhookUrl: string;
  mode: ConnectMode;
  webhookSecret?: string;
}

export default function BotsListPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<ConnectMode>("webhook");
  /**
   * Если режим forwarded — после успешного подключения показываем модалку
   * с webhookSecret и инструкцией. Секрет в ответе приходит ОДИН раз —
   * после закрытия его уже нельзя посмотреть, только сротировать.
   */
  const [forwardedSuccess, setForwardedSuccess] = useState<ConnectedBot | null>(null);

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
        mode,
      });
      return r.data?.data as ConnectedBot;
    },
    onSuccess: (data) => {
      setOpen(false);
      setToken("");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["tg-bots"] });
      if (data?.mode === "forwarded" && data.webhookSecret) {
        // Открываем модал с инструкцией — пользователь должен скопировать
        // webhookSecret в env внешнего бэка ДО закрытия.
        setForwardedSuccess(data);
      } else {
        toast.success("Бот подключён");
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message || "Не удалось подключить бота");
    },
  });

  const copyToClipboard = (s: string, label: string) => {
    navigator.clipboard.writeText(s).catch(() => {});
    toast.success(`${label} скопирован`);
  };

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
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={b.isActive ? "default" : "secondary"}>
                      {b.isActive ? "active" : "off"}
                    </Badge>
                    {b.connectionMode === "forwarded" && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Eye className="h-3 w-3" /> наблюдатель
                      </Badge>
                    )}
                  </div>
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
            {/* Режим подключения. Webhook — стандарт (LMS управляет ботом).
                Forwarded — LMS только наблюдает: подходит если бот уже
                работает на другом бэке (например prepodavai-polling). */}
            <div>
              <Label>Режим подключения</Label>
              <div className="mt-1.5 grid grid-cols-1 gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                    mode === "webhook"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={mode === "webhook"}
                    onChange={() => setMode("webhook")}
                  />
                  <div>
                    <div className="text-sm font-medium">Полное подключение</div>
                    <div className="text-xs text-muted-foreground">
                      LMS управляет ботом: сама ставит webhook, принимает
                      апдейты, отвечает по сценариям, ведёт Inbox.
                    </div>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                    mode === "forwarded"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={mode === "forwarded"}
                    onChange={() => setMode("forwarded")}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      Наблюдатель (форвард с внешнего бэка)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Бот уже работает на другом сервере (например prepodavai).
                      LMS только принимает копии апдейтов: ведёт подписчиков,
                      теги, UTM, синк в Bitrix24. Не отвечает в Telegram.
                    </div>
                  </div>
                </label>
              </div>
            </div>

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
                {mode === "forwarded" && (
                  <>
                    {" "}В режиме «Наблюдатель» нужен только для проверки
                    бота через getMe — отправки в Telegram не будет.
                  </>
                )}
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

      {/* ─── Forwarded success: показываем webhookSecret один раз ──────── */}
      <Dialog
        open={!!forwardedSuccess}
        onOpenChange={(open) => {
          if (!open) setForwardedSuccess(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> Бот подключён как наблюдатель
            </DialogTitle>
          </DialogHeader>
          {forwardedSuccess && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <strong>Скопируй секрет ниже сейчас.</strong> После закрытия
                окна посмотреть его нельзя — только сротировать.
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  1. Webhook URL — куда внешний бэк шлёт апдейты
                </Label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {forwardedSuccess.webhookUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(forwardedSuccess.webhookUrl, "URL")
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  2. Webhook Secret — для заголовка
                  X-Telegram-Bot-Api-Secret-Token
                </Label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {forwardedSuccess.webhookSecret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        forwardedSuccess.webhookSecret!,
                        "Secret"
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  3. Env для внешнего бэка (prepodavai)
                </Label>
                <pre className="mt-1 rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto">
{`LMS_WEBHOOK_URL=${forwardedSuccess.webhookUrl}
LMS_WEBHOOK_SECRET=${forwardedSuccess.webhookSecret}`}
                </pre>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Дальше: в коде бота добавь middleware, который на каждый
                  update шлёт POST на LMS_WEBHOOK_URL с заголовком{" "}
                  <code className="bg-muted px-1 rounded">
                    X-Telegram-Bot-Api-Secret-Token: $LMS_WEBHOOK_SECRET
                  </code>{" "}
                  и телом самого update.
                </p>
                <p>
                  В LMS этот бот теперь в режиме «наблюдатель»: исходящие из
                  сценариев и Inbox не отправляются — чтобы не дублировать
                  ответы внешнего бэка. Подписчики, теги, UTM и Bitrix24-синк
                  работают как обычно.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setForwardedSuccess(null)}>
                  Готово
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
