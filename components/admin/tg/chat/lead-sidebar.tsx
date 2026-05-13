"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";

export interface SubscriberDetail {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  variables: Record<string, unknown>;
  isBlocked: boolean;
  lastSeenAt: string | null;
  subscribedAt: string;
  firstTouchSlug: string | null;
  firstTouchAt: string | null;
  lastTouchSlug: string | null;
  lastTouchAt: string | null;
}

interface ActiveRun {
  id: string;
  status: string;
  flow: { name: string };
  currentNodeId: string | null;
  resumeAt: string | null;
}

// Shape of /context endpoint response — see
// app/api/admin/tg/bots/[botId]/subscribers/[subscriberId]/context/route.ts
interface LeadContext {
  identity: {
    chatId: string;
    tgUserId: string;
    languageCode: string | null;
    subscribedAt: string;
    unsubscribedAt: string | null;
  };
  touches: {
    first: TouchInfo | null;
    last: TouchInfo | null;
  };
  stats: {
    messagesIn: number;
    messagesOut: number;
    buttonClicks: number;
  };
  flowHistory: Array<{
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    currentNodeId: string | null;
    lastError: string | null;
    flow: { name: string };
  }>;
  broadcasts: Array<{
    id: string;
    status: string;
    sentAt: string | null;
    errorMessage: string | null;
    broadcast: { id: string; name: string };
  }>;
  events: Array<{
    id: string;
    type: string;
    properties: Record<string, unknown>;
    occurredAt: string;
  }>;
}

interface TouchInfo {
  slug: string;
  at: string | null;
  link: {
    slug: string;
    name: string;
    utm: Record<string, string>;
    applyTags: string[];
  } | null;
}

interface Props {
  botId: string;
  subscriberId: string;
  subscriber: SubscriberDetail;
  activeRuns: ActiveRun[];
}

function humanizeRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} дн назад`;
  return d.toLocaleDateString("ru-RU");
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const last = abs % 10;
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

// "21 день" / "3 месяца" / "1 год"
function humanizeDurationSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "сегодня";
  if (days < 30) return `${days} ${plural(days, ["день", "дня", "дней"])}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${plural(months, ["месяц", "месяца", "месяцев"])}`;
  const years = Math.floor(days / 365);
  return `${years} ${plural(years, ["год", "года", "лет"])}`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Pretty event line for the timeline section. Returns a compact string
// with the type token + the most useful payload field.
function describeEvent(ev: { type: string; properties: Record<string, unknown> }): string {
  const p = ev.properties ?? {};
  const get = (k: string) => (p[k] === undefined ? null : String(p[k]));
  switch (ev.type) {
    case "subscriber.tag_added":
      return `+ тег ${get("tag")}`;
    case "subscriber.tag_removed":
      return `− тег ${get("tag")}`;
    case "subscriber.variable_set":
      return `var ${get("key")} = ${get("value")}`;
    case "button.clicked":
      return `🔘 ${get("callbackData")}`;
    case "flow.entered":
      return `▶ запуск ${get("triggerType") ?? "флоу"}`;
    case "flow.completed":
      return `✓ завершил флоу`;
    case "flow.cancelled":
      return `✕ отменён`;
    case "flow.failed":
      return `⚠ упал: ${get("error") ?? ""}`;
    case "flow.node_executed":
      return `↳ ${get("nodeType")}:${get("nodeId")}`;
    case "message.sent":
      return `→ отправили`;
    case "message.received":
      return `← получили`;
    case "message.send_failed":
      return `⚠ send_failed: ${get("description") ?? get("errorCode")}`;
    case "broadcast.delivered":
      return `📨 доставлено`;
    case "subscriber.blocked_bot":
      return `🚫 заблокировал`;
    case "subscriber.unblocked_bot":
      return `✓ разблокировал`;
    case "subscriber.created":
      return `🎉 подписан ${get("source") ? `(${get("source")})` : ""}`;
    case "link.clicked":
      return `🔗 ${get("slug")}`;
    default:
      return ev.type;
  }
}

function statusBadgeVariant(s: string): "default" | "secondary" | "destructive" {
  if (s === "completed" || s === "sent") return "default";
  if (s === "failed" || s === "blocked") return "destructive";
  return "secondary";
}

export function LeadSidebar({ botId, subscriberId, subscriber, activeRuns }: Props) {
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [flowId, setFlowId] = useState("");
  const [eventsOpen, setEventsOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);

  const { data: flowsList } = useQuery({
    queryKey: ["tg-flows-list", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows`);
      return (r.data?.data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Extended profile: identity / UTM details / stats / flow history /
  // broadcasts received / event timeline. Refetched periodically so the
  // sidebar stays fresh while a chat is open.
  const { data: ctx } = useQuery({
    queryKey: ["tg-sub-context", botId, subscriberId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/subscribers/${subscriberId}/context`
      );
      return r.data?.data as LeadContext | undefined;
    },
    refetchInterval: 30_000,
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiClient.patch(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tg-sub", botId, subscriberId] });
      queryClient.invalidateQueries({ queryKey: ["tg-subs", botId] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err?.response?.data?.error?.message || "Ошибка");
    },
  });

  const name =
    [subscriber.firstName, subscriber.lastName].filter(Boolean).join(" ") ||
    subscriber.chatId;
  const initials = (subscriber.firstName?.[0] ?? subscriber.chatId[0] ?? "?").toUpperCase();

  return (
    <aside className="space-y-5 rounded-lg border bg-card p-4 text-sm">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {subscriber.username ? `@${subscriber.username}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">chat: {subscriber.chatId}</div>
        </div>
      </header>

      <section className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {subscriber.isBlocked ? (
            <Badge variant="destructive">blocked</Badge>
          ) : (
            <Badge>active</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            активен: {humanizeRelative(subscriber.lastSeenAt)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          подписан: {new Date(subscriber.subscribedAt).toLocaleDateString("ru-RU")} ·{" "}
          <span title={formatAbsolute(subscriber.subscribedAt)}>
            {humanizeDurationSince(subscriber.subscribedAt)} на боте
          </span>
        </div>
        {ctx?.identity?.unsubscribedAt && (
          <div className="text-xs text-destructive">
            отписался: {new Date(ctx.identity.unsubscribedAt).toLocaleDateString("ru-RU")}
          </div>
        )}
      </section>

      {/* Identity (collapsible — secondary info) */}
      <section className="space-y-1">
        <button
          type="button"
          onClick={() => setIdentityOpen((v) => !v)}
          className="flex w-full items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {identityOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Идентификаторы
        </button>
        {identityOpen && (
          <div className="space-y-0.5 pl-4 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">chat_id</span>
              <span>{subscriber.chatId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">tg_user_id</span>
              <span>{ctx?.identity.tgUserId ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">language</span>
              <span>{ctx?.identity.languageCode ?? "—"}</span>
            </div>
          </div>
        )}
      </section>

      {/* Source / UTM — rich version with resolved tracking links */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Атрибуция
        </Label>
        {!ctx?.touches.first && !ctx?.touches.last && (
          <div className="text-xs text-muted-foreground">органика (без UTM)</div>
        )}
        {ctx?.touches.first && (
          <TouchBlock label="First touch" touch={ctx.touches.first} />
        )}
        {ctx?.touches.last &&
          ctx.touches.last.slug !== ctx.touches.first?.slug && (
            <TouchBlock label="Last touch" touch={ctx.touches.last} />
          )}
      </section>

      {/* Aggregate stats */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Статистика
        </Label>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <StatTile label="входящие" value={ctx?.stats.messagesIn ?? "—"} />
          <StatTile label="исходящие" value={ctx?.stats.messagesOut ?? "—"} />
          <StatTile label="клики кнопок" value={ctx?.stats.buttonClicks ?? "—"} />
          <StatTile
            label="на боте"
            value={humanizeDurationSince(subscriber.subscribedAt)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Теги</Label>
        <div className="flex flex-wrap gap-1">
          {subscriber.tags.map((t) => (
            <Badge key={t} variant="secondary" className="flex items-center gap-1">
              {t}
              <button
                onClick={() => patch.mutate({ removeTags: [t] })}
                className="hover:text-destructive"
                aria-label={`Удалить тег ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {subscriber.tags.length === 0 && (
            <span className="text-xs text-muted-foreground">пока нет тегов</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="новый тег"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                patch.mutate({ addTags: [newTag.trim()] });
                setNewTag("");
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newTag.trim()) return;
              patch.mutate({ addTags: [newTag.trim()] });
              setNewTag("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Переменные
        </Label>
        <div className="space-y-1 text-sm">
          {Object.entries(subscriber.variables ?? {}).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0"
            >
              <span className="font-mono">{k}</span>
              <span className="flex items-center gap-1.5">
                <span className="truncate text-muted-foreground" style={{ maxWidth: 120 }}>
                  {String(v)}
                </span>
                <button
                  onClick={() => patch.mutate({ setVariables: { [k]: null } })}
                  className="hover:text-destructive"
                  aria-label={`Удалить переменную ${k}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}
          {Object.keys(subscriber.variables ?? {}).length === 0 && (
            <span className="text-xs text-muted-foreground">пусто</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="ключ"
            value={varKey}
            onChange={(e) => setVarKey(e.target.value)}
          />
          <Input
            placeholder="значение"
            value={varValue}
            onChange={(e) => setVarValue(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!varKey.trim()) return;
              patch.mutate({ setVariables: { [varKey.trim()]: varValue } });
              setVarKey("");
              setVarValue("");
            }}
          >
            ок
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Активные сценарии
        </Label>
        {!activeRuns.length ? (
          <div className="text-xs text-muted-foreground">нет активных</div>
        ) : (
          <div className="space-y-1">
            {activeRuns.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b py-1 text-xs last:border-0"
              >
                <span className="truncate" style={{ maxWidth: 160 }}>
                  {r.flow.name}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Запустить сценарий
        </Label>
        <select
          className="w-full rounded border bg-background px-2 py-1.5 text-sm"
          value={flowId}
          onChange={(e) => setFlowId(e.target.value)}
          aria-label="Выбрать сценарий"
        >
          <option value="">— выберите сценарий —</option>
          {(flowsList ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!flowId || subscriber.isBlocked}
          onClick={() => {
            patch.mutate(
              { startFlowId: flowId },
              {
                onSuccess: () => {
                  toast.success("Сценарий запущен");
                  setFlowId("");
                },
              }
            );
          }}
        >
          Запустить
        </Button>
      </section>

      {/* Flow history — completed / cancelled / failed runs */}
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          История сценариев
        </Label>
        {!ctx?.flowHistory.length ? (
          <div className="text-xs text-muted-foreground">пока пусто</div>
        ) : (
          <div className="space-y-1">
            {ctx.flowHistory.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0"
                title={r.lastError ?? formatAbsolute(r.startedAt)}
              >
                <span className="truncate" style={{ maxWidth: 140 }}>
                  {r.flow.name}
                </span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <Badge variant={statusBadgeVariant(r.status)} className="text-[10px]">
                    {r.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(r.finishedAt ?? r.startedAt).toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Broadcasts received */}
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Полученные рассылки
        </Label>
        {!ctx?.broadcasts.length ? (
          <div className="text-xs text-muted-foreground">пока пусто</div>
        ) : (
          <div className="space-y-1">
            {ctx.broadcasts.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0"
                title={b.errorMessage ?? formatAbsolute(b.sentAt)}
              >
                <span className="truncate" style={{ maxWidth: 140 }}>
                  {b.broadcast.name}
                </span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <Badge variant={statusBadgeVariant(b.status)} className="text-[10px]">
                    {b.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {b.sentAt
                      ? new Date(b.sentAt).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : "—"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Events timeline — collapsible since it's noisy */}
      <section className="space-y-1">
        <button
          type="button"
          onClick={() => setEventsOpen((v) => !v)}
          className="flex w-full items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {eventsOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Лента событий
          {ctx?.events?.length ? (
            <span className="ml-1 text-muted-foreground">({ctx.events.length})</span>
          ) : null}
        </button>
        {eventsOpen && (
          <div className="max-h-72 space-y-0.5 overflow-y-auto pl-4 text-[11px]">
            {!ctx?.events.length ? (
              <div className="text-muted-foreground">пусто</div>
            ) : (
              ctx.events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-baseline justify-between gap-2 border-b py-0.5 last:border-0"
                  title={`${e.type} · ${formatAbsolute(e.occurredAt)}`}
                >
                  <span className="truncate" style={{ maxWidth: 200 }}>
                    {describeEvent(e)}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-[10px]">
                    {new Date(e.occurredAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </aside>
  );
}

// ----------------------------------------------------------------
// Small presentational helpers — kept local so the sidebar file stays
// self-contained and easy to skim.
// ----------------------------------------------------------------

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function TouchBlock({ label, touch }: { label: string; touch: TouchInfo }) {
  const utm = touch.link?.utm ?? {};
  const utmEntries = Object.entries(utm).filter(([, v]) => v != null && v !== "");
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {touch.at ? new Date(touch.at).toLocaleDateString("ru-RU") : "—"}
        </span>
      </div>
      <div className="mt-0.5">
        <span className="font-mono text-[11px]">{touch.slug}</span>
        {touch.link?.name && (
          <span className="ml-2 text-[10px] text-muted-foreground">
            «{touch.link.name}»
          </span>
        )}
      </div>
      {utmEntries.length > 0 && (
        <dl className="mt-1 space-y-0.5">
          {utmEntries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-[10px]">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate" style={{ maxWidth: 160 }}>
                {String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {touch.link?.applyTags?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {touch.link.applyTags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
