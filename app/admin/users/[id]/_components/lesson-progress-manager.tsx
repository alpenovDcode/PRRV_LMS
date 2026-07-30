"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, BookOpen, Loader2, Award } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface EnrollmentOption {
  course: {
    id: string;
    title: string;
  };
}

interface LessonProgressRow {
  id: string;
  title: string;
  type: string;
  status: "not_started" | "in_progress" | "completed" | "failed";
  watchedTime: number;
  completedAt: string | null;
  module: {
    id: string;
    title: string;
    orderIndex: number;
  };
  latestSubmission: {
    id: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
  } | null;
}

const STATUS_META: Record<LessonProgressRow["status"], { label: string; className: string }> = {
  not_started: { label: "Не начат", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "В процессе", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Пройден", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Не пройден", className: "bg-red-100 text-red-700" },
};

const TYPE_LABELS: Record<string, string> = {
  video: "Видео",
  text: "Текст",
  quiz: "Квиз",
  track_definition: "Определение трека",
  intermediate_survey: "Опрос",
  certification_form: "Сертификация",
};

export function LessonProgressManager({
  userId,
  enrollments,
}: {
  userId: string;
  enrollments: EnrollmentOption[];
}) {
  const queryClient = useQueryClient();
  const courses = useMemo(
    () =>
      Array.from(
        new Map(enrollments.map((enrollment) => [enrollment.course.id, enrollment.course])).values()
      ),
    [enrollments]
  );
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [lessonToReset, setLessonToReset] = useState<LessonProgressRow | null>(null);

  useEffect(() => {
    if (!courses.some((course) => course.id === courseId)) {
      setCourseId(courses[0]?.id ?? "");
    }
  }, [courseId, courses]);

  const progressQuery = useQuery({
    queryKey: ["admin", "users", userId, "lesson-progress", courseId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/users/${userId}/progress`, {
        params: { courseId },
      });
      return response.data.data as LessonProgressRow[];
    },
    enabled: Boolean(courseId),
  });

  const resetMutation = useMutation({
    mutationFn: async (lesson: LessonProgressRow) => {
      const response = await apiClient.delete(`/admin/users/${userId}/progress/update`, {
        params: { lessonId: lesson.id },
      });
      return response.data.data as {
        lessonType: string;
        deletedProgress: number;
        reopenedSubmissions: number;
      };
    },
    onSuccess: (data) => {
      toast.success(
        data.lessonType === "certification_form"
          ? "Сертификация открыта для повторного прохождения"
          : "Прогресс урока сброшен"
      );
      setLessonToReset(null);
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", userId, "lesson-progress", courseId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
    },
    onError: (error: unknown) => {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response !== null &&
        "data" in error.response &&
        typeof error.response.data === "object" &&
        error.response.data !== null &&
        "error" in error.response.data &&
        typeof error.response.data.error === "object" &&
        error.response.data.error !== null &&
        "message" in error.response.data.error &&
        typeof error.response.data.error.message === "string"
          ? error.response.data.error.message
          : "Не удалось сбросить прогресс";
      toast.error(message);
    },
  });

  if (courses.length === 0) {
    return (
      <Card className="border-none bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Прогресс по урокам</CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center text-gray-500">
          Пользователь не зачислен ни на один курс.
        </CardContent>
      </Card>
    );
  }

  const lessons = progressQuery.data ?? [];

  return (
    <>
      <Card className="border-none bg-white shadow-sm">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Прогресс по урокам</CardTitle>
            <CardDescription className="mt-1">
              Выберите конкретный урок, чтобы студент смог пройти его заново.
            </CardDescription>
          </div>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full md:w-[320px]">
              <SelectValue placeholder="Выберите курс" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {progressQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка уроков…
            </div>
          ) : progressQuery.isError ? (
            <div className="py-12 text-center text-red-600">Не удалось загрузить прогресс.</div>
          ) : lessons.length === 0 ? (
            <div className="py-12 text-center text-gray-500">В курсе нет уроков.</div>
          ) : (
            <div className="divide-y">
              {lessons.map((lesson, index) => {
                const status = STATUS_META[lesson.status];
                const isCertification = lesson.type === "certification_form";
                const canReset =
                  lesson.status !== "not_started" || Boolean(lesson.latestSubmission);

                return (
                  <div
                    key={lesson.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isCertification ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {isCertification ? (
                        <Award className="h-5 w-5" />
                      ) : (
                        <BookOpen className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {index + 1}. {lesson.title}
                        </span>
                        <Badge className={`${status.className} border-0`}>{status.label}</Badge>
                        {isCertification && (
                          <Badge className="border-0 bg-amber-100 text-amber-800">
                            Сертификация
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>{lesson.module.title}</span>
                        <span>{TYPE_LABELS[lesson.type] ?? lesson.type}</span>
                        {lesson.latestSubmission && (
                          <span>Последняя отправка: {lesson.latestSubmission.status}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={!canReset}
                      onClick={() => setLessonToReset(lesson)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Сбросить
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(lessonToReset)}
        onOpenChange={(open) => !open && setLessonToReset(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lessonToReset?.type === "certification_form"
                ? "Открыть повторную сертификацию?"
                : "Сбросить прогресс урока?"}
            </DialogTitle>
            <DialogDescription>
              {lessonToReset?.type === "certification_form"
                ? `Студент сможет заново заполнить анкету и пройти тестирование «${lessonToReset.title}». Старая попытка сохранится в аналитике.`
                : `Урок «${lessonToReset?.title ?? ""}» снова будет отмечен как непройденный.`}
            </DialogDescription>
          </DialogHeader>
          {lessonToReset?.type === "certification_form" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Уже выданный сертификат не удаляется. Модули, открывающиеся после сертификации, могут
              временно закрыться до повторного прохождения.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonToReset(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={resetMutation.isPending}
              onClick={() => lessonToReset && resetMutation.mutate(lessonToReset)}
            >
              {resetMutation.isPending
                ? "Сбрасываем…"
                : lessonToReset?.type === "certification_form"
                  ? "Открыть повторно"
                  : "Сбросить прогресс"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
