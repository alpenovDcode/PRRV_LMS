"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { describeSource } from "@/lib/tg/chat-helpers";
import { MediaPreview } from "./media-preview";
import { SourcePill } from "./source-pill";

export interface ChatMessage {
  id: string;
  direction: string;
  text: string | null;
  mediaType: string | null;
  mediaFileId: string | null;
  callbackData: string | null;
  sourceType: string | null;
  sourceId: string | null;
  rawPayload: unknown;
  createdAt: string;
  /** Optimistic-send marker — not from the DB. */
  pending?: boolean;
}

interface Props {
  botId: string;
  message: ChatMessage;
  /** True only for the last message in a burst — show the timestamp here. */
  showTimestamp: boolean;
  flowsById: Record<string, string>;
  broadcastsById: Record<string, string>;
}

/**
 * Strict Telegram-style HTML rendering: we only allow <b>, <i>, <a href>.
 * Everything else is escaped. We rely on a tiny purposeful sanitizer
 * because dompurify isn't installed and the input space is well-defined
 * (Telegram already accepted the HTML on the server side).
 */
function renderTextHtml(raw: string): string {
  // 1. Full HTML escape.
  let s = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // 2. Re-permit the safe set. <b>, <i>, </b>, </i>, <a href="..."> with
  // http(s) URLs only. The href is double-escaped through escapeAttr.
  s = s.replace(/&lt;(\/?)(b|i)&gt;/g, "<$1$2>");
  s = s.replace(
    /&lt;a\s+href=&quot;((?:https?:\/\/|tg:\/\/)[^&"<>\s]+)&quot;&gt;/g,
    (_match, href: string) => `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" class="underline">`
  );
  s = s.replace(/&lt;\/a&gt;/g, "</a>");

  // 3. Convert newlines.
  s = s.replace(/\n/g, "<br />");
  return s;
}

function escapeAttr(v: string): string {
  return v.replace(/"/g, "&quot;");
}

function MessageBubbleInner({
  botId,
  message: m,
  showTimestamp,
  flowsById,
  broadcastsById,
}: Props) {
  const isOut = m.direction === "out";
  const flowId = m.sourceType === "flow" && m.sourceId ? m.sourceId.split(":")[0] : null;
  const descriptor = describeSource({
    direction: m.direction,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    callbackData: m.callbackData,
    flowName: flowId ? flowsById[flowId] ?? null : null,
    broadcastName: m.sourceType === "broadcast" && m.sourceId ? broadcastsById[m.sourceId] ?? null : null,
  });

  const date = new Date(m.createdAt);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const fullIso = date.toISOString();

  return (
    <div className={cn("flex w-full flex-col", isOut ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3 py-2 shadow-sm",
          isOut
            ? "rounded-br-sm bg-primary text-white"
            : "rounded-bl-sm bg-zinc-100 text-zinc-900",
          m.pending && "opacity-60"
        )}
      >
        {m.mediaType && m.mediaFileId ? (
          <div className="mb-1">
            <MediaPreview
              botId={botId}
              mediaType={m.mediaType}
              mediaFileId={m.mediaFileId}
              rawPayload={m.rawPayload}
              isOut={isOut}
            />
          </div>
        ) : null}

        {m.text ? (
          <div
            className="whitespace-pre-wrap break-words text-sm leading-snug"
            // Safe: we hand-render a tiny allowlist (b, i, a[href starts with http/tg]).
            dangerouslySetInnerHTML={{ __html: renderTextHtml(m.text) }}
          />
        ) : !m.mediaType && m.callbackData ? (
          <div className="text-xs italic text-zinc-600">🔘 {m.callbackData}</div>
        ) : null}

        {showTimestamp ? (
          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              isOut ? "text-white/80" : "text-zinc-500"
            )}
            title={fullIso}
          >
            {m.pending ? <span>отправляется...</span> : <span>{time}</span>}
          </div>
        ) : null}
      </div>

      {descriptor ? <SourcePill descriptor={descriptor} align={isOut ? "right" : "left"} /> : null}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
