"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Plus,
  ExternalLink,
  Users as UsersIcon,
  Copy,
  Eye,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Страница /admin/bots объединяет в один список TG-ботов (модель TgBot)
 * и MAX-ботов (модель MessagingBot, channel="max"). Внутри карточки
 * по-разному ведут себя:
 *
 *   Telegram → /admin/bots/[id]/...   (TgFlow / TgSubscriber / TgBroadcast)
 *   MAX      → /admin/messaging/[id]/...   (MessagingFlow / MessagingSubscriber / ...)
 *
 * Это компромисс: данные у TG и MAX живут в разных таблицах (исторически
 * TG появился первым), но снаружи список один — пользователь видит общий
 * экран «Боты» и подключает любой из двух типов одним и тем же диалогом.
 *
 * Instagram (тоже MessagingBot, channel="instagram") в этом списке
 * НЕ показывается — UI для него отключён, но данные в БД остаются
 * (на случай возврата).
 */

// ─── Telegram (модель TgBot) ──────────────────────────────────────────────

interface TgBotItem {
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

interface ConnectedTgBot {
  id: string;
  username: string;
  title: string;
  webhookUrl: string;
  mode: ConnectMode;
  webhookSecret?: string;
}

// ─── MAX (модель MessagingBot, channel="max") ──────────────────────────────

interface MessagingBotItem {
  id: string;
  channel: "telegram" | "instagram" | "max";
  externalAccountId: string;
  title: string;
  isActive: boolean;
  tokenExpiresAt: string | null;
  meta: any;
  createdAt: string;
  _count: { subscribers: number };
}

// ─── Единый вид для рендера карточки ──────────────────────────────────────

type UnifiedBot =
  | {
      kind: "telegram";
      id: string;
      title: string;
      subtitle: string; // @username
      isActive: boolean;
      subscribers: number;
      tokenPrefix: string;
      connectionMode?: "webhook" | "forwarded";
      openHref: string;
      externalHref?: string;
    }
  | {
      kind: "max";
      id: string;
      title: string;
      subtitle: string; // bot_id из MAX
      isActive: boolean;
      subscribers: number;
      openHref: string;
    };

type BotKind = "telegram" | "max";

export default function BotsListPage() {
  const queryClient = useQueryClient();

  // ── Диалог подключения ──────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BotKind>("telegram");

  // Telegram form
  const [tgToken, setTgToken] = useState("");
  const [tgTitle, setTgTitle] = useState("");
  const [tgMode, setTgMode] = useState<ConnectMode>("webhook");
  /**
   * Если режим forwarded — после успешного подключения показываем модалку
   * с webhookSecret и инструкцией. Секрет в ответе приходит ОДИН раз —
   * после закрытия его уже нельзя посмотреть, только сротировать.
   */
  const [forwardedSuccess, setForwardedSuccess] = useState<ConnectedTgBot | null>(
    null
  );

  // MAX form
  const [maxToken, setMaxToken] = useState("");

  // ── Данные ──────────────────────────────────────────────────────────────
  const tgQuery = useQuery({
    queryKey: ["tg-bots"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/tg/bots");
      return (r.data?.data ?? []) as TgBotItem[];
    },
  });

  const maxQuery = useQuery({
    queryKey: ["messaging-bots", "max"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/messaging/bots?channel=max");
      return (r.data?.data ?? []) as MessagingBotItem[];
    },
  });

  const isLoading = tgQuery.isLoading || maxQuery.isLoading;

  /** Объединённый список с сортировкой по createdAt (свежие сверху). */
  const bots = useMemo<UnifiedBot[]>(() => {
    const tg: Array<UnifiedBot & { _ts: number }> =
      (tgQuery.data ?? []).map((b) => ({
        kind: "telegram" as const,
        id: b.id,
        title: b.title || `@${b.username}`,
        subtitle: `@${b.username}`,
        isActive: b.isActive,
        subscribers: b.subscriberCount,
        tokenPrefix: b.tokenPrefix,
        connectionMode: b.connectionMode,
        openHref: `/admin/bots/${b.id}`,
        externalHref: `https://t.me/${b.username}`,
        _ts: new Date(b.createdAt).getTime(),
      }));
    const mx: Array<UnifiedBot & { _ts: number }> =
      (maxQuery.data ?? []).map((b) => ({
        kind: "max" as const,
        id: b.id,
        title: b.title || `MAX-бот ${b.externalAccountId}`,
        subtitle: b.externalAccountId,
        isActive: b.isActive,
        subscribers: b._count.subscribers,
        // Внутри MAX-бота воронки/inbox/рассылки живут на /admin/messaging/[id]/...
        openHref: `/admin/messaging/${b.id}/flows`,
        _ts: new Date(b.createdAt).getTime(),
      }));
    return [...tg, ...mx]
      .sort((a, b) => b._ts - a._ts)
      .map(({ _ts: _, ...rest }) => rest as UnifiedBot);
  }, [tgQuery.data, maxQuery.data]);

  // ── Мутации подключения ─────────────────────────────────────────────────

  const connectTg = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post("/admin/tg/bots", {
        token: tgToken.trim(),
        title: tgTitle.trim() || undefined,
        mode: tgMode,
      });
      return r.data?.data as ConnectedTgBot;
    },
    onSuccess: (data) => {
      setOpen(false);
      setTgToken("");
      setTgTitle("");
      queryClient.invalidateQueries({ queryKey: ["tg-bots"] });
      if (data?.mode === "forwarded" && data.webhookSecret) {
        setForwardedSuccess(data);
      } else {
        toast.success("Бот подключён");
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message || "Не удалось подключить бота");
    },
  });

  const connectMax = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/messaging/max/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: maxToken.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error ?? "Не удалось подключить MAX-бота");
      }
      return data.data as { title: string };
    },
    onSuccess: (data) => {
      setOpen(false);
      setMaxToken("");
      queryClient.invalidateQueries({ queryKey: ["messaging-bots", "max"] });
      toast.success(`MAX-бот «${data.title}» подключён`);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Не удалось подключить MAX-бота");
    },
  });

  const connectPending = connectTg.isPending || connectMax.isPending;
  const canSubmit =
    kind === "telegram" ? !!tgToken.trim() : !!maxToken.trim();

  const submit = () => {
    if (kind === "telegram") connectTg.mutate();
    else connectMax.mutate();
  };

  const copyToClipboard = (s: string, label: string) => {
    navigator.clipboard.writeText(s).catch(() => {});
    toast.success(`${label} скопирован`);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Боты</h1>
          <p className="text-sm text-muted-foreground">
            Telegram и МАКС в одном списке: подключайте ботов, ведите подписчиков,
            запускайте сценарии и рассылки.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Подключить бота
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : bots.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Пока нет подключённых ботов. Создайте Telegram-бота через @BotFather
            или MAX-бота через @MasterBot и нажмите «Подключить бота».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bots.map((b) => (
            <Card
              key={`${b.kind}:${b.id}`}
              className="hover:border-primary/40 transition"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {b.kind === "telegram" ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                      )}{" "}
                      {b.title}
                    </CardTitle>
                    <CardDescription>{b.subtitle}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={b.isActive ? "default" : "secondary"}>
                      {b.isActive ? "active" : "off"}
                    </Badge>
                    {/* Бейдж типа канала — чтобы сразу было видно, TG это или MAX */}
                    <Badge
                      variant="outline"
                      className={
                        b.kind === "telegram"
                          ? "text-[10px] border-sky-400 text-sky-600"
                          : "text-[10px] border-blue-500 text-blue-600"
                      }
                    >
                      {b.kind === "telegram" ? "Telegram" : "МАКС"}
                    </Badge>
                    {b.kind === "telegram" && b.connectionMode === "forwarded" && (
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
                  <span>{b.subscribers} подписчиков</span>
                </div>
                {b.kind === "telegram" && (
                  <div className="text-xs text-muted-foreground break-all">
                    token: {b.tokenPrefix}…
                  </div>
                )}
                <div className="flex gap-2">
                  <Link href={b.openHref} className="flex-1">
                    <Button variant="default" className="w-full">
                      Открыть
                    </Button>
                  </Link>
                  {b.kind === "telegram" && b.externalHref && (
                    <a
                      href={b.externalHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="icon">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Диалог подключения: выбор типа + форма ─────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить бота</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Выбор типа: Telegram vs MAX */}
            <div>
              <Label>Тип бота</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors ${
                    kind === "telegram"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    checked={kind === "telegram"}
                    onChange={() => setKind("telegram")}
                  />
                  <Bot className="h-4 w-4 text-sky-500" />
                  <span className="text-sm font-medium">Telegram</span>
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors ${
                    kind === "max"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    checked={kind === "max"}
                    onChange={() => setKind("max")}
                  />
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">МАКС</span>
                </label>
              </div>
            </div>

            {kind === "telegram" ? (
              <>
                {/* Режим подключения. Webhook — стандарт (LMS управляет ботом).
                    Forwarded — LMS только наблюдает: подходит если бот уже
                    работает на другом бэке (например prepodavai-polling). */}
                <div>
                  <Label>Режим подключения</Label>
                  <div className="mt-1.5 grid grid-cols-1 gap-2">
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                        tgMode === "webhook"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        checked={tgMode === "webhook"}
                        onChange={() => setTgMode("webhook")}
                      />
                      <div>
                        <div className="text-sm font-medium">
                          Полное подключение
                        </div>
                        <div className="text-xs text-muted-foreground">
                          LMS управляет ботом: сама ставит webhook, принимает
                          апдейты, отвечает по сценариям, ведёт Inbox.
                        </div>
                      </div>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                        tgMode === "forwarded"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        checked={tgMode === "forwarded"}
                        onChange={() => setTgMode("forwarded")}
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
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:AA..."
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Токен зашифровывается AES-256-GCM перед сохранением.
                    {tgMode === "forwarded" && (
                      <>
                        {" "}
                        В режиме «Наблюдатель» нужен только для проверки бота
                        через getMe — отправки в Telegram не будет.
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <Label>Название (необязательно)</Label>
                  <Input
                    value={tgTitle}
                    onChange={(e) => setTgTitle(e.target.value)}
                    placeholder="Курс Прорыв — основной бот"
                  />
                </div>
              </>
            ) : (
              <>
                {/* MAX — токен от @MasterBot */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  <p className="font-semibold mb-1.5">Как получить токен:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-800">
                    <li>
                      Открой <strong>MAX</strong> и найди{" "}
                      <strong>@MasterBot</strong>
                    </li>
                    <li>
                      Команда{" "}
                      <code className="bg-white px-1 rounded">/newbot</code> —
                      придумай имя
                    </li>
                    <li>Скопируй токен который пришлёт MasterBot</li>
                    <li>Вставь его сюда</li>
                  </ol>
                </div>

                <div>
                  <Label>Bot token (MAX)</Label>
                  <Input
                    value={maxToken}
                    onChange={(e) => setMaxToken(e.target.value)}
                    placeholder="например: AbCdEfGhIjKlMnOpQrStUvWx..."
                    autoComplete="off"
                    className="font-mono"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Токен шифруется AES-256 перед сохранением и не передаётся
                    на фронт повторно.
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={submit} disabled={connectPending || !canSubmit}>
                {connectPending ? "Подключаю..." : "Подключить"}
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
                <Button onClick={() => setForwardedSuccess(null)}>Готово</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
