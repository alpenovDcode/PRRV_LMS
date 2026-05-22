"use client";

// Раздел «Подписчики» в виде мессенджера (Telegram Web-style):
// слева список диалогов, справа — открытая переписка.
// Старая табличная версия и bulk-операции вынесены: массовые действия
// закрываются рассылками и scheduled-flows, а тут фокус на диалогах.

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload, GitMerge, MessageSquare, ArrowLeft } from "lucide-react";
import { ConversationList } from "@/components/admin/tg/chat/conversation-list";
import { ChatPage } from "@/components/admin/tg/chat/chat-page";

export default function SubscribersPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;

  // Выбранный диалог. Храним в state — при F5 сбрасывается (как в
  // Telegram Web), зато не нужен Suspense вокруг useSearchParams.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-210px)] min-h-[540px] flex-col">
      {/* Тулбар: точечные операции с базой подписчиков */}
      <div className="flex shrink-0 items-center justify-end gap-2 pb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers/import`)}
        >
          <Upload className="mr-1 h-4 w-4" /> Импорт CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers/merge`)}
        >
          <GitMerge className="mr-1 h-4 w-4" /> Объединить дубли
        </Button>
      </div>

      {/* Мессенджер — flex (не grid): flex-дети надёжно stretch’атся
          на высоту контейнера, h-full внутренних панелей работает. */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-200">
        {/* Левая колонка — список диалогов.
            На мобильном: на всю ширину; скрыта, когда открыт чат. */}
        <div
          className={
            (selectedId ? "hidden md:flex " : "flex ") +
            "min-h-0 flex-1 flex-col md:flex-none md:w-[340px]"
          }
        >
          <ConversationList
            botId={botId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Правая колонка — переписка либо заглушка.
            На мобильном: скрыта, когда чат не выбран. */}
        <div
          className={
            (selectedId ? "flex " : "hidden md:flex ") +
            "min-h-0 min-w-0 flex-1 flex-col"
          }
        >
          {selectedId ? (
            <>
              {/* Кнопка «назад к списку» — только на мобильном */}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex shrink-0 items-center gap-1 border-b border-zinc-100 px-3 py-2 text-sm text-zinc-600 md:hidden"
              >
                <ArrowLeft className="h-4 w-4" /> К списку диалогов
              </button>
              {/* key — чтобы при смене подписчика ChatPage пересоздавался
                  с чистым внутренним состоянием (pendingBubbles и т.п.) */}
              <div className="min-h-0 flex-1">
                <ChatPage
                  key={selectedId}
                  botId={botId}
                  subscriberId={selectedId}
                  embedded
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400">
              <MessageSquare className="h-12 w-12" strokeWidth={1.5} />
              <p className="text-sm">Выберите диалог слева</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
