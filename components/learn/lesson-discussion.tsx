"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2, MessageSquare, Reply, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CommentUser {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: CommentUser;
  replies: Comment[];
}

interface LessonDiscussionProps {
  lessonId: string;
}

export function LessonDiscussion({ lessonId }: LessonDiscussionProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string } | null>(null);

  const { data: comments, isLoading } = useQuery<Comment[]>({
    queryKey: ["lesson-comments", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/lessons/${lessonId}/comments`);
      return response.data.data;
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      const response = await apiClient.post(`/lessons/${lessonId}/comments`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-comments", lessonId] });
      setContent("");
      setReplyTo(null);
      toast.success("Комментарий отправлен");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || "Не удалось отправить комментарий";
      toast.error(message);
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) return;

    createCommentMutation.mutate({
      content,
      parentId: replyTo?.id,
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <Card className="border-gray-200">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Обсуждение и вопросы
        </h3>

        {/* Comment Input */}
        <div className="mb-8 space-y-4">
          {replyTo && (
            <div className="flex items-center justify-between bg-blue-50 p-2 rounded-md text-sm text-blue-700">
              <span className="flex items-center gap-2">
                <Reply className="h-4 w-4" />
                Ответ для <strong>{replyTo.userName}</strong>
              </span>
              <button onClick={() => setReplyTo(null)} className="hover:text-blue-900">
                Отмена
              </button>
            </div>
          )}
          <Textarea
            placeholder={replyTo ? "Напишите ваш ответ..." : "Задайте вопрос или поделитесь мыслями..."}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end">
            <Button 
              onClick={handleSubmit} 
              disabled={createCommentMutation.isPending || !content.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createCommentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {replyTo ? "Ответить" : "Отправить комментарий"}
            </Button>
          </div>
        </div>

        {/* Comments List */}
        <div className="space-y-6">
          {!comments || comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Пока нет комментариев. Будьте первым!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="space-y-4">
                {/* Parent Comment */}
                <div className="flex gap-4">
                  <Avatar className="h-10 w-10 border border-gray-200">
                    <AvatarImage src={comment.user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-blue-100 text-blue-700">
                      {getInitials(comment.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold text-gray-900">
                        {comment.user.fullName || "Пользователь"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(comment.createdAt), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                    <div className="flex items-center gap-4 pt-1">
                      <button
                        onClick={() => {
                            setReplyTo({ id: comment.id, userName: comment.user.fullName || "Пользователь" });
                            // Optional: scroll to input
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-xs font-medium text-gray-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                      >
                        <Reply className="h-3 w-3" />
                        Ответить
                      </button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-14 space-y-4 pl-4 border-l-2 border-gray-100">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 border border-gray-200">
                          <AvatarImage src={reply.user.avatarUrl || undefined} />
                          <AvatarFallback className="bg-gray-100 text-gray-700 text-xs">
                            {getInitials(reply.user.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-baseline justify-between">
                            <span className="font-medium text-sm text-gray-900">
                              {reply.user.fullName || "Пользователь"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(reply.createdAt), {
                                addSuffix: true,
                                locale: ru,
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{reply.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
