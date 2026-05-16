"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Lock, Star, Mic, Loader2 } from "lucide-react";
import { ImageUploader, QuestionAttachment } from "@/components/questions/image-uploader";
import { ImageLightbox } from "@/components/questions/image-lightbox";
import { AudioRecorder } from "@/components/ui/audio-recorder";
import { AudioMessage } from "@/components/questions/audio-message";

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
  const [pendingAttachments, setPendingAttachments] = useState<QuestionAttachment[]>([]);
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showRating, setShowRating] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Lightbox: collect all images from all messages, open by url
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);

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
    mutationFn: async () =>
      (await apiClient.post(`/questions/${questionId}/messages`, {
        content: input,
        attachments: pendingAttachments,
      })).data.data,
    onSuccess: () => {
      setInput("");
      setPendingAttachments([]);
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

  const uploadAudio = async (blob: Blob) => {
    setIsUploadingAudio(true);
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a" : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "audio");
      const res = await apiClient.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data?.data;
      if (data?.url) {
        setPendingAttachments((prev) => [
          ...prev,
          { url: data.url, name: data.originalName || data.name || file.name, type: blob.type, size: blob.size },
        ]);
        setIsVoiceMode(false);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Не удалось загрузить голосовое сообщение");
    } finally {
      setIsUploadingAudio(false);
    }
  };

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
        {(() => {
          // Build a flat list of all images in this thread for lightbox navigation
          const allImages: { url: string; name?: string }[] = [];
          messages.forEach((m: any) => {
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            atts.forEach((a: any) => {
              if (a?.url && (!a.type || String(a.type).startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.url))) {
                allImages.push({ url: a.url, name: a.name });
              }
            });
          });

          return messages.map((m: any) => {
            const mine = m.authorId === viewerId;
            const authorName = m.author?.fullName || m.author?.email || "—";
            const atts = (Array.isArray(m.attachments) ? m.attachments : []) as any[];
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
                  {m.content && (
                    <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                  )}
                  {atts.length > 0 && (
                    <div className={cn("flex flex-wrap gap-2", m.content ? "mt-2" : "")}>
                      {atts.map((a: any, i: number) => {
                        const isAudio = String(a.type).startsWith("audio/");
                        const isImage = !isAudio && (!a.type || String(a.type).startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.url || ""));
                        if (isAudio && a.url) {
                          return <AudioMessage key={i} url={a.url} mine={mine} />;
                        }
                        if (isImage && a.url) {
                          const idxInAll = allImages.findIndex((img) => img.url === a.url);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightboxIndex(idxInAll >= 0 ? idxInAll : 0)}
                              className="block"
                            >
                              <img
                                src={a.url}
                                alt={a.name || ""}
                                className="h-32 w-32 object-cover rounded-md border border-white/20 hover:opacity-90 cursor-zoom-in"
                              />
                            </button>
                          );
                        }
                        return (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "text-xs underline break-all",
                              mine ? "text-blue-100" : "text-blue-600"
                            )}
                          >
                            {a.name || "файл"}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Lightbox */}
      {lightboxIndex >= 0 && (() => {
        const allImages: { url: string; name?: string }[] = [];
        messages.forEach((m: any) => {
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          atts.forEach((a: any) => {
            if (a?.url && (!a.type || String(a.type).startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.url))) {
              allImages.push({ url: a.url, name: a.name });
            }
          });
        });
        return (
          <ImageLightbox
            images={allImages}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(-1)}
            onIndexChange={setLightboxIndex}
          />
        );
      })()}

      {/* Input */}
      <div className="border-t bg-white p-3">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
            <Lock className="h-4 w-4" /> Диалог закрыт
          </div>
        ) : canSend ? (
          <div className="space-y-2">
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingAttachments.map((a, i) => {
                  const isAudio = String(a.type).startsWith("audio/");
                  if (isAudio) {
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-700">
                        <Mic className="h-4 w-4 text-gray-500 shrink-0" />
                        <span className="truncate max-w-[140px]">Голосовое сообщение</span>
                        <button
                          type="button"
                          onClick={() => setPendingAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                          className="ml-1 text-gray-400 hover:text-red-500"
                        >
                          ×
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="relative group">
                      <img src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
                    if (input.trim() || pendingAttachments.length > 0) send.mutate();
                  }
                }}
              />
              <Button
                onClick={() => send.mutate()}
                disabled={(!input.trim() && pendingAttachments.length === 0) || send.isPending}
                className="bg-blue-600 hover:bg-blue-700 self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <ImageUploader attachments={pendingAttachments.filter(a => !String(a.type).startsWith("audio/"))} onChange={(imgs) => setPendingAttachments((prev) => [...prev.filter(a => String(a.type).startsWith("audio/")), ...imgs])} compact />
              <button
                type="button"
                onClick={() => setIsVoiceMode((v) => !v)}
                disabled={isUploadingAudio}
                className={cn(
                  "inline-flex items-center gap-2 text-sm disabled:opacity-50 transition-colors",
                  isVoiceMode ? "text-red-500 hover:text-red-600" : "text-blue-600 hover:text-blue-700"
                )}
              >
                {isUploadingAudio ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {isUploadingAudio ? "Загрузка..." : isVoiceMode ? "Отмена" : "Голосовое"}
              </button>
            </div>
            {isVoiceMode && (
              <AudioRecorder
                onRecordingComplete={uploadAudio}
                onClear={() => {}}
                className="w-full"
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
