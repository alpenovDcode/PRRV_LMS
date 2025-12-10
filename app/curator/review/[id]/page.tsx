"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, ArrowLeft, FileDown, MessageSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type HomeworkStatus = "pending" | "approved" | "rejected";

interface SubmissionDetail {
  id: string;
  status: HomeworkStatus;
  content: string | null;
  files: string[] | null;
  curatorComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    fullName: string | null;
    email: string;
  };
  lesson: {
    id: string;
    title: string;
  };
  course: {
    id: string;
    title: string;
  };
}

function statusLabel(status: HomeworkStatus) {
  switch (status) {
    case "pending":
      return "На проверке";
    case "approved":
      return "Принято";
    case "rejected":
      return "Отклонено";
    default:
      return status;
  }
}

function statusVariant(status: HomeworkStatus) {
  switch (status) {
    case "pending":
      return "outline" as const;
    case "approved":
      return "default" as const;
    case "rejected":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default function CuratorReviewPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  
  const commentTemplates = [
    { id: "good", label: "Хорошая работа", text: "Отличная работа! Вы хорошо справились с заданием. Продолжайте в том же духе!" },
    { id: "needs_improvement", label: "Требует доработки", text: "Работа выполнена, но есть моменты, которые нужно улучшить:\n\n1. \n2. \n3. " },
    { id: "excellent", label: "Превосходно", text: "Превосходная работа! Вы продемонстрировали глубокое понимание материала. Молодец!" },
  ];

  const { data, isLoading } = useQuery<SubmissionDetail>({
    queryKey: ["curator", "submission", submissionId],
    queryFn: async () => {
      const response = await apiClient.get(`/curator/homework/${submissionId}`);
      return response.data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: { status: HomeworkStatus; curatorComment?: string }) => {
      await apiClient.patch(`/curator/homework/${submissionId}`, payload);
    },
    onSuccess: () => {
      toast.success("Результат проверки сохранен");
      queryClient.invalidateQueries({ queryKey: ["curator", "inbox"] });
      router.push("/curator/inbox");
    },
    onError: () => {
      toast.error("Не удалось сохранить результат проверки");
    },
  });

  const handleDecision = (status: HomeworkStatus) => {
    mutation.mutate({ status, curatorComment: comment || undefined });
  };

  return (
    <CuratorLayout>
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/curator/inbox">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Проверка домашнего задания</h1>
            <p className="text-muted-foreground">
              Просмотрите ответ студента, оставьте комментарий и выберите решение.
            </p>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[2fr,1.5fr]">
            {/* Left: student answer */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Ответ студента</CardTitle>
                  <CardDescription>
                    {data.user.fullName || data.user.email} • {data.course.title} /{" "}
                    {data.lesson.title}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      Отправлено: {new Date(data.createdAt).toLocaleString("ru-RU")}
                    </span>
                    {data.reviewedAt && (
                      <span>
                        Проверено: {new Date(data.reviewedAt).toLocaleString("ru-RU")}
                      </span>
                    )}
                    <Badge variant={statusVariant(data.status)} className="ml-auto">
                      {statusLabel(data.status)}
                    </Badge>
                  </div>

                  <div className="rounded-md border bg-muted/40 p-4 min-h-[150px] whitespace-pre-wrap text-sm">
                    {data.content || (
                      <span className="text-muted-foreground">
                        Текст ответа не указан
                      </span>
                    )}
                  </div>

                  {data.files && data.files.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Прикрепленные файлы</p>
                      <div className="space-y-1">
                        {data.files.map((file, idx) => (
                          <a
                            key={file + idx}
                            href={file}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <FileDown className="h-4 w-4" />
                            <span className="truncate">{file.split("/").pop()}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: curator decision */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Решение куратора</CardTitle>
                  <CardDescription>
                    Напишите комментарий и выберите, принять или отклонить работу.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Комментарий</label>
                    <div className="space-y-2">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => {
                          setSelectedTemplate(value);
                          const template = commentTemplates.find(t => t.id === value);
                          if (template) {
                            setComment(template.text);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full border-gray-300">
                          <MessageSquare className="mr-2 h-4 w-4" />
                          <SelectValue placeholder="Выбрать шаблон ответа" />
                        </SelectTrigger>
                        <SelectContent>
                          {commentTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder="Напишите, что студент сделал хорошо и что можно улучшить..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={8}
                        className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                      {data.curatorComment && !comment && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-blue-900 mb-1">Предыдущий комментарий:</p>
                          <p className="text-xs text-blue-800 whitespace-pre-wrap">{data.curatorComment}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleDecision("approved")}
                      disabled={mutation.isPending || data.status === "approved"}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Принять
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                      onClick={() => handleDecision("rejected")}
                      disabled={mutation.isPending || data.status === "rejected"}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Вернуть на доработку
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </CuratorLayout>
  );
}


