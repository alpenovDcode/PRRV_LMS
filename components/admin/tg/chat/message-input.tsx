"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  botId: string;
  subscriberId: string;
  isBlocked: boolean;
  /** Fired when the API call succeeds. Parent uses this to render the optimistic bubble. */
  onSent: (text: string) => void;
  /** Imperative send — uses the existing PATCH endpoint. */
  sendMessage: (text: string) => Promise<void>;
}

export function MessageInput({ isBlocked, onSent, sendMessage }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autoresize 1..6 rows.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 6 * 24 + 16; // approx 6 rows
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  if (isBlocked) {
    return (
      <div className="border-t bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Подписчик заблокировал бота — отправка сообщений недоступна.
      </div>
    );
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await sendMessage(trimmed);
      onSent(trimmed);
      setValue("");
      // Restore focus after the textarea collapses.
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || "Не удалось отправить";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setValue("");
    }
  }

  return (
    <div className="border-t bg-background px-3 pt-3 pb-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Сообщение… (HTML: <b>, <i>, <a>; шаблоны: {{user.first_name}})"
          className="min-h-[42px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-snug shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={sending}
          aria-label="Текст сообщения"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!value.trim() || sending}
          className="h-[42px] shrink-0"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Отправить
        </Button>
      </div>
      <div className="mt-1 px-1 text-[11px] text-muted-foreground">
        Cmd/Ctrl+Enter — отправить. Поддерживаются HTML (&lt;b&gt;, &lt;i&gt;, &lt;a&gt;) и шаблоны{" "}
        <code className="font-mono">{`{{user.first_name}}`}</code>,{" "}
        <code className="font-mono">{`{{vars.x}}`}</code>.
      </div>
    </div>
  );
}
