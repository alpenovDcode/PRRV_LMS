
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Trash2, Reply, ExternalLink, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";


interface CommentUser {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: CommentUser;
  lessonId: string;
  lesson: {
    id: string;
    title: string;
    module: {
      course: {
        title: string;
      };
    };
  };
  replies: Comment[];
}

interface CommentsResponse {
  data: {
    comments: Comment[];
    total: number;
    page: number;
    totalPages: number;
  };
}

export default function AdminCommentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const { data, isLoading } = useQuery<CommentsResponse>({
    queryKey: ["admin", "comments", page, limit],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/comments?page=${page}&limit=${limit}`);
      return response.data;
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/admin/comments?id=${commentId}`);
    },
    onSuccess: () => {
      toast.success("Комментарий удален");
      queryClient.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
    onError: () => {
      toast.error("Не удалось удалить комментарий");
    },
  });

  const replyCommentMutation = useMutation({
    mutationFn: async ({ lessonId, content, parentId }: { lessonId: string; content: string; parentId: string }) => {
      await apiClient.post(`/lessons/${lessonId}/comments`, { content, parentId });
    },
    onSuccess: () => {
      toast.success("Ответ отправлен");
      setReplyingTo(null);
      setReplyContent("");
      queryClient.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
    onError: () => {
        toast.error("Не удалось отправить ответ");
    },
  });

  const handleReplySubmit = (lessonId: string, parentId: string) => {
    if (!replyContent.trim()) return;
    replyCommentMutation.mutate({ lessonId, content: replyContent, parentId });
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

  const commentsData = data?.data;
  const comments = commentsData?.comments || [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Обсуждения уроков</h1>
          <p className="text-muted-foreground mt-1">
            Модерируйте комментарии и отвечайте студентам.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Последние комментарии</CardTitle>
          <CardDescription>
            {isLoading ? "Загружаем..." : `Всего комментариев: ${commentsData?.total || 0}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Комментариев пока нет</p>
            </div>
          ) : (
            <div className="space-y-6">
              {comments.map((comment) => (
                <div key={comment.id} className="border-b last:border-0 pb-6 last:pb-0">
                  <div className="flex gap-4">
                    <Avatar className="h-10 w-10 border">
                      <AvatarImage src={comment.user.avatarUrl || undefined} />
                      <AvatarFallback>{getInitials(comment.user.fullName)}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 space-y-1">
                        {/* Header: User, Date, Lesson Link */}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                                {comment.user.fullName || comment.user.email}
                            </span>
                            <span className="text-xs text-gray-500">
                                {formatDistanceToNow(new Date(comment.createdAt), {
                                    addSuffix: true,
                                    locale: ru,
                                })}
                            </span>
                        </div>
                        <Link 
                            href={`/learn/${comment.lesson.module.course.title}/${comment.lessonId}`} 
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            target="_blank"
                        >
                            <ExternalLink className="h-3 w-3" />
                            {comment.lesson.module.course.title} • {comment.lesson.title}
                        </Link>
                      </div>

                      {/* Content */}
                      <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">
                        {comment.content}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-gray-500 hover:text-blue-600"
                            onClick={() => {
                                if (replyingTo === comment.id) {
                                    setReplyingTo(null);
                                    setReplyContent("");
                                } else {
                                    setReplyingTo(comment.id);
                                    setReplyContent("");
                                }
                            }}
                        >
                            <Reply className="h-3 w-3 mr-1" />
                            {replyingTo === comment.id ? "Отмена" : "Ответить"}
                        </Button>

                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-gray-500 hover:text-red-600"
                            onClick={() => {
                                if (window.confirm("Удалить этот комментарий? Это действие нельзя отменить.")) {
                                    deleteCommentMutation.mutate(comment.id);
                                }
                            }}
                        >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Удалить
                        </Button>
                      </div>

                      {/* Reply Input */}
                      {replyingTo === comment.id && (
                          <div className="mt-4 flex gap-2 items-start animate-in fade-in slide-in-from-top-2">
                              <Textarea 
                                  value={replyContent}
                                  onChange={(e) => setReplyContent(e.target.value)}
                                  placeholder={`Ответ для ${comment.user.fullName}...`}
                                  className="min-h-[80px]"
                                  autoFocus
                              />
                              <Button 
                                  size="icon" 
                                  onClick={() => handleReplySubmit(comment.lessonId, comment.id)}
                                  disabled={!replyContent.trim() || replyCommentMutation.isPending}
                              >
                                  {replyCommentMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                      <Send className="h-4 w-4" />
                                  )}
                              </Button>
                          </div>
                      )}

                      {/* Nested Replies (Aggregated view) */}
                      {comment.replies && comment.replies.length > 0 && (
                          <div className="mt-4 pl-4 border-l-2 border-gray-100 space-y-4">
                              {comment.replies.map((reply) => (
                                  <div key={reply.id} className="text-sm">
                                      <div className="flex items-center gap-2 mb-1">
                                          <Avatar className="h-6 w-6">
                                              <AvatarImage src={reply.user.avatarUrl || undefined} />
                                              <AvatarFallback className="text-[10px]">
                                                  {getInitials(reply.user.fullName)}
                                              </AvatarFallback>
                                          </Avatar>
                                          <span className="font-semibold text-gray-900 text-xs">
                                              {reply.user.fullName}
                                          </span>
                                          <span className="text-gray-400 text-xs">
                                              {formatDistanceToNow(new Date(reply.createdAt), {
                                                  addSuffix: true,
                                                  locale: ru,
                                              })}
                                          </span>
                                          <button 
                                              className="text-gray-400 hover:text-red-600 ml-auto p-1"
                                              onClick={() => {
                                                  if (window.confirm("Удалить этот ответ? Это действие нельзя отменить.")) {
                                                      deleteCommentMutation.mutate(reply.id);
                                                  }
                                              }}
                                          >
                                              <Trash2 className="h-3 w-3" />
                                          </button>
                                      </div>
                                      <p className="text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                                  </div>
                              ))}
                          </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

           {/* Pagination */}
           {commentsData && commentsData.totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t mt-6">
              <div className="text-sm text-gray-500">
                Страница {page} из {commentsData.totalPages}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Назад
                </Button>
                <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, commentsData.totalPages) }, (_, i) => {
                        let pNum = i + 1;
                        if (commentsData.totalPages > 5 && page > 3) {
                            pNum = page - 2 + i;
                        }
                        if (pNum > commentsData.totalPages) return null;
                        
                        return (
                            <Button
                            key={pNum}
                            variant={page === pNum ? "default" : "ghost"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setPage(pNum)}
                            >
                            {pNum}
                            </Button>
                        );
                    })}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={page >= commentsData.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Вперед
                </Button>
              </div>
            </div>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
