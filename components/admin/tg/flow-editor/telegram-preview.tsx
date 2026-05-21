"use client";

// Live-preview сообщения — что увидит подписчик в Telegram.
// Не идеальный «pixel-perfect» — нам важна семантика: переносы,
// HTML-разметка, кнопки, медиа-плейсхолдер, видимые placeholders
// `{{client.x}}` (подсвечены, чтобы автор знал, что будет подставлено
// в рантайме).

import { sanitizeTelegramHtml } from "@/lib/tg/sanitize";
import { TG_LIMITS, lengthSeverity, tgLen } from "@/lib/tg/limits";
import type { FlowMessagePayload } from "@/lib/tg/flow-schema";
import { Image as ImageIcon, Video, FileAudio, FileText, Mic, Film, AlertTriangle } from "lucide-react";

interface Props {
  payload: FlowMessagePayload;
}

// Превращает плейсхолдеры вида `{{client.first_name}}` в спан с
// классом-«плашкой», чтобы автор видел, где будет подстановка.
// Делаем это ДО sanitizer’а, потому что наш `<span class="...">` пройдёт
// его как обычный текст с подсветкой через highlight markers, которые
// мы потом заменим уже на HTML.
function annotatePlaceholders(raw: string): string {
  // Используем приватные маркеры, которые точно не встретятся в обычном
  // тексте, чтобы sanitizer их сохранил как plain-text, а мы потом
  // обернули в реальные <span>.
  return raw.replace(/\{\{([^}]+)\}\}/g, "PH$1");
}

function unwrapPlaceholders(safeHtml: string): string {
  return safeHtml.replace(
    /PH([^]+)/g,
    (_m, key) =>
      `<span class="rounded bg-purple-100 px-1 text-[11px] font-mono text-purple-700">{{${key}}}</span>`
  );
}

const MEDIA_ICON: Record<string, React.ReactNode> = {
  photo: <ImageIcon className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  voice: <Mic className="h-4 w-4" />,
  video_note: <Film className="h-4 w-4" />,
  audio: <FileAudio className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  animation: <Film className="h-4 w-4" />,
};

function LengthBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const sev = lengthSeverity(used, limit);
  const color =
    sev === "error"
      ? "text-red-600 border-red-300 bg-red-50"
      : sev === "warn"
        ? "text-amber-700 border-amber-300 bg-amber-50"
        : "text-zinc-500 border-zinc-200 bg-zinc-50";
  return (
    <div className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${color}`}>
      {sev === "error" && <AlertTriangle className="h-3 w-3" />}
      <span className="font-mono">{used.toLocaleString("ru-RU")}</span>
      <span>/</span>
      <span className="font-mono">{limit.toLocaleString("ru-RU")}</span>
      <span className="ml-1">{label}</span>
    </div>
  );
}

export function TelegramPreview({ payload }: Props) {
  const text = payload.text ?? "";
  const attachments = payload.attachments ?? [];
  const buttonRows = payload.buttonRows ?? [];
  const hasMedia = attachments.length > 0 || !!payload.photoUrl;
  const textLimit = hasMedia ? TG_LIMITS.MEDIA_CAPTION : TG_LIMITS.MESSAGE_TEXT;

  const annotated = annotatePlaceholders(text);
  const sanitized = sanitizeTelegramHtml(annotated);
  const html = unwrapPlaceholders(sanitized);

  // Длинные button-тексты тоже стоит подсветить.
  const overLengthButtons: Array<{ row: number; col: number; len: number }> = [];
  buttonRows.forEach((row, ri) =>
    row.forEach((b, ci) => {
      if (tgLen(b.text) > TG_LIMITS.BUTTON_TEXT) {
        overLengthButtons.push({ row: ri, col: ci, len: tgLen(b.text) });
      }
    })
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>📱 Превью в Telegram</span>
        <div className="flex gap-1 flex-wrap justify-end">
          <LengthBar
            used={tgLen(text)}
            limit={textLimit}
            label={hasMedia ? "caption" : "text"}
          />
        </div>
      </div>

      {hasMedia && (
        <div className="rounded bg-white border border-zinc-200 p-2 space-y-2">
          {attachments.length > 0 ? (
            attachments.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-zinc-100/80 px-2 py-1 text-xs text-zinc-700"
              >
                {MEDIA_ICON[a.kind] ?? <FileText className="h-4 w-4" />}
                <span className="font-medium">{a.kind}</span>
                <span className="font-mono text-[10px] text-zinc-500 truncate">
                  {a.fileId
                    ? `file_id: ${a.fileId.slice(0, 16)}…`
                    : a.url
                      ? a.url
                      : "—"}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded bg-zinc-100/80 px-2 py-1 text-xs text-zinc-700">
              <ImageIcon className="h-4 w-4" />
              <span>photo</span>
            </div>
          )}
          {attachments.length > 4 && (
            <div className="text-[10px] text-zinc-500">
              + ещё {attachments.length - 4} вложений
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
        {text ? (
          <div
            className="prose prose-sm max-w-none text-[13px] leading-snug whitespace-pre-wrap break-words [&_a]:text-blue-600 [&_a]:underline [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_pre]:rounded [&_pre]:bg-zinc-100 [&_pre]:p-2 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-2"
            dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
          />
        ) : (
          <div className="text-[12px] italic text-zinc-400">пустое сообщение</div>
        )}

        {payload.keyboardMode !== "reply" && buttonRows.length > 0 && (
          <div className="mt-2 space-y-1">
            {buttonRows.map((row, ri) => (
              <div key={ri} className="flex gap-1">
                {row.map((b, ci) => {
                  const tooLong = tgLen(b.text) > TG_LIMITS.BUTTON_TEXT;
                  return (
                    <div
                      key={ci}
                      className={`flex-1 truncate rounded border px-2 py-1 text-center text-[11px] ${
                        tooLong
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}
                      title={
                        b.url
                          ? `URL: ${b.url}`
                          : b.callback
                            ? `callback: ${b.callback}`
                            : b.onClick
                              ? "inline action"
                              : "noop"
                      }
                    >
                      {b.text || <span className="italic text-zinc-400">пусто</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {payload.keyboardMode === "reply" && buttonRows.length > 0 && (
        <div className="rounded bg-white border border-zinc-200 p-2">
          <div className="text-[10px] text-zinc-500 mb-1">
            ⇪ Reply-клавиатура (под полем ввода)
          </div>
          <div className="space-y-1">
            {buttonRows.map((row, ri) => (
              <div key={ri} className="flex gap-1">
                {row.map((b, ci) => (
                  <div
                    key={ci}
                    className="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-center text-[11px] text-zinc-700"
                  >
                    {b.requestContact && "📞 "}
                    {b.requestLocation && "📍 "}
                    {b.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {overLengthButtons.length > 0 && (
        <div className="text-[10px] text-red-600 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5" />
          <span>
            Кнопок с длинным текстом: {overLengthButtons.length}. Telegram режет
            всё, что больше {TG_LIMITS.BUTTON_TEXT} символов.
          </span>
        </div>
      )}
    </div>
  );
}
