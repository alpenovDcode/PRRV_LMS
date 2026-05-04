"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Lock, Star } from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: "Ожидает наставника", color: "bg-amber-100 text-amber-800" },
  in_progress: { label: "В диалоге", color: "bg-blue-100 text-blue-800" },
  answered: { label: "Отвечено", color: "bg-emerald-100 text-emerald-800" },
  closed: { label: "Закрыт", color: "bg-gray-100 text-gray-700" },
};

interface Props {
  questionId: string;
  viewerRole: "student" | "curator" | "admin";
  viewerId: string;
}

export function QuestionChatThread({ questionId, viewerRole, viewerId }: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showRating, setShowRating] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => (await apiClient.get(`/questions/${questionId}`)).data.data,
    refetchInterval: 5000,
  });

  const question = data?.question;
  const messages = (question?.messages || []) as any[];

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => (await apiClient.post(`/questions/${questionId}/messages`, { content: input })).data.data,
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["curator-questions"] });
      queryClient.invalidateQueries({ queryKey: ["my-questions"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Не удалось отправить"),
  });

  const take = useMutation({
    mutationFn: async () => (await apiClient.post(`/questions/${questionId}/take`, {})).data.data,
    onSuccess: () => {
      toast.success("Вы взяли вопрос в работу");
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["curator-questions"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Не удалось"),
  });

  const close = useMutation({
    mutationFn: async () => (await apiClient.post(`/questions/${questionId}/close`, {})).data.data,
    onSuccess: () => {
      toast.success("Диалог закрыт");
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["curator-questions"] });
      queryClient.invalidateQueries({ queryKey: ["my-questions"] });
      if (viewerRole === "student") setShowRating(true);
    },
    onError: () => toast.error("Не удалось закрыть"),
  });

  const rate = useMutation({
    mutationFn: async () =>
      (await apiClient.post(`/questions/${questionId}/rate`, { rating, comment: ratingComment })).data.data,
    onSuccess: () => {
      toast.success("Оценка сохранена");
      setShowRating(false);
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["my-questions"] });
    },
    onError: () => toast.error("Не удалось сохранить оценку"),
  });

  if (isLoading || !question) {
    return <div className="flex h-full items-center justify-center text-gray-500">Загрузка диалога...</div>;
  }

  const status = STATUS_LABEL[question.status] || STATUS_LABEL.open;
  const isStudent = viewerRole === "student";
  const isCurator = viewerRole === "curator" || viewerRole === "admin";
  const isClosed = question.status === "closed";
  const canTake = isCurator && !question.curatorId;
  const canSend = !isClosed && (isStudent || isCurator);
  const canRate = isStudent && question.rating == null && (question.status === "answered" || question.status === "closed" || question.firstResponseAt);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 truncate">{question.subject}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
              <Badge className={status.color + " border-0"}>{status.label}</Badge>
              <span>Студент: {question.student?.fullName || question.student?.email}</span>
              {question.curator && <span>· Наставник: {question.curator.fullName || question.curator.email}</span>}
              {question.rating != null && (
                <Badge className="bg-purple-100 text-purple-800 border-0 flex items-center gap-1">
                  <Star className="h-3 w-3" /> {question.rating}/10
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canTake && (
              <Button size="sm" onClick={() => take.mutate()} disabled={take.isPending}>
                Взять в работу
              </Button>
            )}
            {!isClosed && (
              <Button size="sm" variant="outline" onClick={() => close.mutate()} disabled={close.isPending}>
                <Lock className="h-4 w-4 mr-1" /> Закрыть
              </Button>
            )}
            {canRate && !showRating && (
              <Button size="sm" variant="outline" onClick={() => setShowRating(true)}>
                <Star className="h-4 w-4 mr-1" /> Оценить
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Rating panel */}
      {showRating && isStudent && (
        <div className="border-b px-4 py-3 bg-purple-50">
          <p className="text-sm font-medium text-gray-900 mb-2">Оцените ответ наставника от 1 до 10</p>
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn(
                  "h-9 w-9 rounded-full text-sm font-medium border transition-colors",
                  rating >= n ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <Textarea
            rows={2}
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={rating < 1 || rate.isPending} onClick={() => rate.mutate()}>
              Сохранить оценку
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowRating(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.map((m: any) => {
          const mine = m.authorId === viewerId;
          const authorName = m.author?.fullName || m.author?.email || "—";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 shadow-sm",
                  mine ? "bg-blue-600 text-white" : "bg-white text-gray-900 border"
                )}
              >
                <div className={cn("text-xs mb-1 opacity-80", mine ? "text-blue-100" : "text-gray-500")}>
                  {authorName} · {new Date(m.createdAt).toLocaleString("ru-RU")}
                </div>
                <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t bg-white p-3">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
            <Lock className="h-4 w-4" /> Диалог закрыт
          </div>
        ) : canSend ? (
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Введите сообщение..."
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (input.trim()) send.mutate();
                }
              }}
            />
            <Button
              onClick={() => send.mutate()}
              disabled={!input.trim() || send.isPending}
              className="bg-blue-600 hover:bg-blue-700 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
