"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { useAuth } from "@/hooks/use-auth";
import { QuestionChatThread } from "@/components/questions/chat-thread";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Inbox } from "lucide-react";

const FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "Новые" },
  { value: "mine", label: "Мои" },
  { value: "all", label: "Все" },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: "Новый", color: "bg-amber-100 text-amber-800" },
  in_progress: { label: "В работе", color: "bg-blue-100 text-blue-800" },
  answered: { label: "Отвечено", color: "bg-emerald-100 text-emerald-800" },
  closed: { label: "Закрыт", color: "bg-gray-100 text-gray-700" },
};

export default function CuratorQuestionsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["curator-questions", filter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ filter });
      if (search.trim()) params.set("search", search.trim());
      return (await apiClient.get(`/curator/questions?${params}`)).data.data;
    },
    refetchInterval: 10000,
  });

  const items = (data?.items || []) as any[];

  return (
    <CuratorLayout>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <div className="border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Inbox className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold">Вопросы наставнику</h1>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md transition-colors",
                    filter === f.value ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* List */}
          <div className="w-[380px] border-r bg-white flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Поиск по теме или студенту..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && <div className="p-4 text-sm text-gray-500">Загрузка...</div>}
              {!isLoading && items.length === 0 && <div className="p-6 text-sm text-gray-500 text-center">Вопросов нет</div>}
              {items.map((q: any) => {
                const s = STATUS_LABEL[q.status] || STATUS_LABEL.open;
                const last = q.messages?.[0];
                const unread = last && last.authorId !== user?.id && !last.readAt;
                return (
                  <button
                    key={q.id}
                    onClick={() => setActiveId(q.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors",
                      activeId === q.id && "bg-blue-50 hover:bg-blue-50",
                      unread && "border-l-4 border-l-blue-500"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {q.student?.fullName || q.student?.email}
                      </span>
                      <Badge className={s.color + " border-0 shrink-0"}>{s.label}</Badge>
                    </div>
                    <div className="text-sm text-gray-700 truncate">{q.subject}</div>
                    {last && <div className="text-xs text-gray-500 truncate mt-1">{last.content}</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(q.updatedAt).toLocaleString("ru-RU")}
                      {q.rating != null && <> · ⭐ {q.rating}/10</>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread */}
          <div className="flex-1 bg-white min-w-0">
            {activeId && user ? (
              <QuestionChatThread questionId={activeId} viewerRole={(user.role as any) || "curator"} viewerId={user.id} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Выберите вопрос слева, чтобы открыть диалог
              </div>
            )}
          </div>
        </div>
      </div>
    </CuratorLayout>
  );
}
