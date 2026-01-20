"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CircleCheck, X, FileText, User, Clock, Upload, Trash, Paperclip } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HomeworkSubmission {
  id: string;
  status: "pending" | "approved" | "rejected";
  content: string | null;
  files: string[];
  createdAt: string;
  reviewedAt: string | null;
  curatorComment: string | null;
  curator?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  curatorFiles?: string[];
  curatorAudioUrl?: string | null;
  user: {
    id: string;
    fullName: string | null;
    email: string;
  };
  lesson: {
    id: string;
    title: string;
    isStopLesson: boolean;
    content: any;
  };
  course: {
    id: string;
    title: string;
  };
  history: Array<{
    status: string;
    curatorComment: string | null;
    reviewedAt: string;
  }>;
}

const quickTemplates = [
  { label: "Отлично!", comment: "Отличная работа! Все выполнено правильно." },
  { label: "Нужны доработки", comment: "Работа требует доработки. Обратите внимание на следующие моменты:" },
  { label: "Принято", comment: "Работа принята. Продолжайте в том же духе!" },
];

import { AudioRecorder } from "@/components/ui/audio-recorder";

// ... existing imports

export default function AdminHomeworkReviewPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;
  const queryClient = useQueryClient();

  const [comment, setComment] = useState("");
  const [curatorFiles, setCuratorFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const { data: submission, isLoading } = useQuery<HomeworkSubmission>({
    queryKey: ["admin", "homework", submissionId],
    queryFn: async () => {
      const response = await apiClient.get(`/curator/homework/${submissionId}`);
      return response.data.data;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ status, comment }: { status: "approved" | "rejected"; comment?: string }) => {
      let audioUrl = undefined;

      // Upload audio if recorded
      if (audioBlob) {
        const formData = new FormData();
        // audioBlob.type usually "audio/webm; codecs=opus" or similar
        const mimeType = audioBlob.type.split(';')[0];
        let ext = "webm";
        if (mimeType.includes("mp4") || mimeType.includes("m4a")) ext = "m4a";
        if (mimeType.includes("mp3")) ext = "mp3";
        if (mimeType.includes("wav")) ext = "wav";
        if (mimeType.includes("ogg")) ext = "ogg";
        
        const file = new File([audioBlob], `voice-feedback-${Date.now()}.${ext}`, { type: audioBlob.type });
        formData.append("file", file);
        formData.append("category", "audio");
        
        try {
          const uploadRes = await apiClient.post("/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          audioUrl = uploadRes.data.data.url;
        } catch (err) {
          console.error("Audio upload failed", err);
          toast.error("Не удалось загрузить голосовое сообщение. Попробуйте еще раз.");
          // Do not proceed with the review update if audio was intended but failed
          throw new Error("Audio upload failed"); 
        }
      }

      await apiClient.patch(`/curator/homework/${submissionId}`, {
        status,
        curatorComment: comment || undefined,
        curatorFiles,
        curatorAudioUrl: audioUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "homework"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "homework", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["curator", "inbox"] });
      
      // Cleanup
      setAudioBlob(null);

      toast.success("Решение принято");
      router.push("/admin/homework");
    },
    onError: () => {
      toast.error("Не удалось сохранить решение");
    },
  });

  const handleApprove = () => {
    reviewMutation.mutate({ status: "approved", comment: comment || undefined });
  };

  const handleReject = () => {
    reviewMutation.mutate({ status: "rejected", comment });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setIsUploading(true);
    const files = Array.from(e.target.files);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "documents");

        const response = await apiClient.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data.data.url;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      setCuratorFiles((prev) => [...prev, ...uploadedUrls]);
      toast.success("Файлы успешно загружены");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Не удалось загрузить файлы");
    } finally {
      setIsUploading(false);
      // Clear input value to allow selecting same file again
      e.target.value = "";
    }
  };

  const handleRemoveFile = (fileUrl: string) => {
    setCuratorFiles((prev) => prev.filter((url) => url !== fileUrl));
  };
  
// ...

  if (isLoading || !submission) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Проверка домашнего задания</h1>
          <p className="text-muted-foreground mt-1">
            {submission.course.title} • {submission.lesson.title}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        {/* Левая часть: Работа студента */}
        <div className="space-y-6">
          {/* Условие задания */}
          <Card>
            <CardHeader>
              <CardTitle>Условие задания</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {submission.lesson.content?.homework ? (
                  <div className="whitespace-pre-wrap">{submission.lesson.content.homework}</div>
                ) : (
                  <p className="text-muted-foreground italic">Текст задания не указан в уроке.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Работа студента</CardTitle>
                <Badge variant={submission.status === "pending" ? "outline" : submission.status === "approved" ? "default" : "destructive"}>
                  {submission.status === "pending"
                    ? "На проверке"
                    : submission.status === "approved"
                      ? "Принято"
                      : "Отклонено"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{submission.user.fullName || submission.user.email}</p>
                  <p className="text-sm text-muted-foreground">{submission.user.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Отправлено: {new Date(submission.createdAt).toLocaleString("ru-RU")}</span>
                </div>
                {submission.reviewedAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleCheck className="h-4 w-4" />
                    <span>Проверено: {new Date(submission.reviewedAt).toLocaleString("ru-RU")}</span>
                  </div>
                )}
              </div>

              {submission.content && (
                <div className="space-y-2">
                  <h3 className="font-medium">Ответ:</h3>
                  <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">{submission.content}</div>
                </div>
              )}

              {submission.files && submission.files.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Прикрепленные файлы:</h3>
                  <div className="space-y-2">
                    {submission.files.map((file, idx) => {
                      // Extract filename from URL (last part after /)
                      const fileName = file.split('/').pop() || file;
                      return (
                        <a
                          key={idx}
                          href={file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate flex-1">{fileName}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {submission.history && submission.history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">История проверок:</h3>
                  <div className="space-y-3">
                    {submission.history.map((item, idx) => (
                      <div key={idx} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={item.status === "approved" ? "default" : "destructive"}>
                            {item.status === "approved" ? "Принято" : "Отклонено"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.reviewedAt).toLocaleString("ru-RU")}
                          </span>
                        </div>
                        {item.curatorComment && (
                          <p className="text-sm text-muted-foreground mt-2">{item.curatorComment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Curator Response Section */}
              {submission.status !== "pending" && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-lg">Ответ куратора</h3>
                  
                  {submission.curator && (
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={submission.curator.avatarUrl || undefined} />
                        <AvatarFallback>{submission.curator.fullName?.[0] || "C"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{submission.curator.fullName || "Куратор"}</p>
                        {submission.reviewedAt && (
                           <p className="text-xs text-muted-foreground">{new Date(submission.reviewedAt).toLocaleString("ru-RU")}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Curator Audio */}
                  {submission.curatorAudioUrl && (
                     <div className="p-3 bg-muted rounded-lg">
                        <h4 className="text-sm font-medium mb-2">Голосовой ответ:</h4>
                        <audio controls src={submission.curatorAudioUrl} className="w-full" />
                     </div>
                  )}

                  {/* Curator Comment */}
                  {submission.curatorComment && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Комментарий:</h4>
                      <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap">{submission.curatorComment}</div>
                    </div>
                  )}

                  {/* Curator Files */}
                  {submission.curatorFiles && submission.curatorFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Прикрепленные файлы:</h4>
                      <div className="space-y-2">
                        {submission.curatorFiles.map((file, idx) => {
                          const fileName = file.split('/').pop() || file;
                          return (
                            <a
                              key={idx}
                              href={file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 border rounded-lg hover:bg-accent transition-colors"
                            >
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm truncate flex-1">{fileName}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Правая часть: Инструменты куратора */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Решение</CardTitle>
              <CardDescription>Примите решение по работе студента</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Голосовой ответ</label>
                <AudioRecorder 
                   onRecordingComplete={setAudioBlob} 
                   onClear={() => setAudioBlob(null)} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Прикрепить файлы</label>
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Input
                    type="file" 
                    multiple
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="cursor-pointer"
                  />
                </div>
                {/* Uploaded Files List */}
                {curatorFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {curatorFiles.map((file, idx) => {
                      const fileName = file.split('/').pop() || file;
                      return (
                         <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate flex-1">{fileName}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveFile(file)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                         </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Комментарий (необязательно)</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Оставьте комментарий для студента..."
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Шаблоны быстрых ответов</label>
                <div className="space-y-2">
                  {quickTemplates.map((template, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => {
                        setComment(template.comment);
                      }}
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="default"
                  className="flex-1 gradient-primary"
                  onClick={handleApprove}
                  disabled={reviewMutation.isPending}
                >
                  <CircleCheck className="mr-2 h-4 w-4" />
                  Принять
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleReject}
                  disabled={reviewMutation.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Отклонить
                </Button>
              </div>

              {submission.lesson.isStopLesson && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <p className="text-sm text-warning-foreground">
                    <strong>Стоп-урок:</strong> После принятия работы студенту откроется следующий урок.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

