"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import {
  initializeProgressMappings,
  replaceProgressMapping,
  type ProgressMapping,
  type ProgressTransferConfidence,
  type ProgressTransferSuggestion,
  type TransferStatus,
} from "@/lib/progress-transfer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface GroupTransferOption {
  id: string;
  name: string;
  courseId?: string | null;
  startDate?: string | null;
  course?: { title: string } | null;
}

interface TransferLessonRow {
  id: string;
  title: string;
  type: string;
  orderIndex: number;
  module: { id: string; title: string; orderIndex: number };
  progress: {
    status: TransferStatus;
    watchedTime: number;
    completedAt: string | null;
  } | null;
}

interface TransferPreview {
  sourceCourse: { id: string; title: string };
  targetCourse: { id: string; title: string };
  sourceLessons: TransferLessonRow[];
  targetLessons: TransferLessonRow[];
  suggestions: ProgressTransferSuggestion[];
  unmatchedSourceLessonIds: string[];
  unmatchedTargetLessonIds: string[];
}

export interface TransferResult {
  sourceGroupId: string;
  targetGroupId: string;
  historyPreserved: boolean;
  enrollmentAction: "unchanged" | "created" | "updated";
  sourceEnrollmentRevoked: boolean;
  transferredLessons: number;
  skippedLessons: number;
}

interface MemberTransferDialogProps {
  open: boolean;
  sourceGroup: GroupTransferOption;
  member: {
    userId: string;
    user: { email: string; fullName: string | null };
  } | null;
  groups: GroupTransferOption[];
  onOpenChange(open: boolean): void;
  onTransferred(result: TransferResult): void;
}

const CONFIDENCE_META: Record<
  ProgressTransferConfidence,
  { label: string; className: string }
> = {
  exact: { label: "Точное совпадение", className: "bg-emerald-100 text-emerald-800" },
  unique_title: { label: "Совпало название", className: "bg-blue-100 text-blue-800" },
  position: { label: "Похоже по позиции", className: "bg-amber-100 text-amber-800" },
  ambiguous: { label: "Нужно выбрать", className: "bg-orange-100 text-orange-800" },
  unmatched: { label: "Не найдено", className: "bg-gray-100 text-gray-700" },
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  not_started: "Не начат",
  in_progress: "В процессе",
  completed: "Пройден",
  failed: "Не пройден",
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (
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
  ) {
    return error.response.data.error.message;
  }
  return fallback;
}

export function MemberTransferDialog({
  open,
  sourceGroup,
  member,
  groups,
  onOpenChange,
  onTransferred,
}: MemberTransferDialogProps) {
  const [targetGroupId, setTargetGroupId] = React.useState("");
  const [revokeSourceEnrollment, setRevokeSourceEnrollment] = React.useState(true);
  const [transferProgress, setTransferProgress] = React.useState(true);
  const [progressMappings, setProgressMappings] = React.useState<ProgressMapping[]>([]);

  const targetGroup = groups.find((group) => group.id === targetGroupId) ?? null;
  const differentCourses = Boolean(
    sourceGroup.courseId &&
      targetGroup?.courseId &&
      sourceGroup.courseId !== targetGroup.courseId
  );

  const previewQuery = useQuery<TransferPreview>({
    queryKey: [
      "admin",
      "groups",
      sourceGroup.id,
      "transfer-preview",
      member?.userId,
      targetGroupId,
    ],
    queryFn: async () => {
      const response = await apiClient.post(
        `/admin/groups/${sourceGroup.id}/members/transfer/preview`,
        { userId: member?.userId, targetGroupId }
      );
      return response.data.data;
    },
    enabled: Boolean(open && member && targetGroupId && differentCourses && transferProgress),
    retry: false,
  });

  React.useEffect(() => {
    if (previewQuery.data) {
      setProgressMappings(initializeProgressMappings(previewQuery.data.suggestions));
    }
  }, [previewQuery.data]);

  React.useEffect(() => {
    if (!open) {
      setTargetGroupId("");
      setRevokeSourceEnrollment(true);
      setTransferProgress(true);
      setProgressMappings([]);
    }
  }, [open]);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!member || !targetGroupId) throw new Error("Выберите участника и новую группу");
      const response = await apiClient.post(
        `/admin/groups/${sourceGroup.id}/members/transfer`,
        {
          userId: member.userId,
          targetGroupId,
          revokeSourceEnrollment: differentCourses ? revokeSourceEnrollment : false,
          progressMappings: differentCourses && transferProgress ? progressMappings : [],
        }
      );
      return response.data.data as TransferResult;
    },
    onSuccess: (result) => {
      toast.success(
        `Участник переведён. Уроков перенесено: ${result.transferredLessons}. Старый курс ${
          result.sourceEnrollmentRevoked ? "закрыт" : "оставлен"
        }.`
      );
      onTransferred(result);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Не удалось перевести участника"));
    },
  });

  const preview = previewQuery.data;
  const sourceLessonById = new Map(preview?.sourceLessons.map((lesson) => [lesson.id, lesson]));
  const mappedTargetIds = new Set(progressMappings.map((mapping) => mapping.targetLessonId));

  const handleTargetGroupChange = (value: string) => {
    setTargetGroupId(value);
    setRevokeSourceEnrollment(true);
    setTransferProgress(true);
    setProgressMappings([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Перевести участника</DialogTitle>
          <DialogDescription>
            История прогресса и домашние задания сохраняются. Выберите, нужно ли закрыть старый
            курс и какие пройденные уроки перенести в новый.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{member?.user.fullName || member?.user.email}</div>
            <div className="text-muted-foreground">Из группы: {sourceGroup.name}</div>
            {sourceGroup.course?.title && (
              <div className="text-muted-foreground">Старый курс: {sourceGroup.course.title}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Новая группа</Label>
            <Select value={targetGroupId} onValueChange={handleTargetGroupChange}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите группу" />
              </SelectTrigger>
              <SelectContent>
                {groups
                  .filter((group) => group.id !== sourceGroup.id)
                  .map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                      {group.course?.title ? ` — ${group.course.title}` : " — без курса"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {targetGroupId && differentCourses && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="revoke-source-enrollment"
                  checked={revokeSourceEnrollment}
                  onCheckedChange={(value) => setRevokeSourceEnrollment(value === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="revoke-source-enrollment">
                    Закрыть доступ к курсу «{sourceGroup.course?.title}»
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Карточка исчезнет из «Моих материалов», но прогресс и домашние задания
                    сохранятся.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="transfer-progress"
                  checked={transferProgress}
                  onCheckedChange={(value) => setTransferProgress(value === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="transfer-progress">
                    Перенести подтверждённый прогресс в «{targetGroup?.course?.title}»
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Автоматически выбраны только однозначные совпадения. Их можно изменить.
                  </p>
                </div>
              </div>
            </div>
          )}

          {targetGroupId && !differentCourses && sourceGroup.courseId !== targetGroup?.courseId && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              У одной из групп не назначен курс. Участник будет переведён без переноса прогресса
              и автоматического закрытия старого курса.
            </div>
          )}

          {differentCourses && transferProgress && previewQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Сопоставляем уроки…
            </div>
          )}

          {differentCourses && transferProgress && previewQuery.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiErrorMessage(previewQuery.error, "Не удалось подготовить перенос прогресса")}
            </div>
          )}

          {differentCourses && transferProgress && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Соответствия уроков</Label>
                <span className="text-xs text-muted-foreground">
                  Выбрано: {progressMappings.length} из {preview.suggestions.length}
                </span>
              </div>
              {preview.suggestions.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  У пользователя пока нет начатых уроков для переноса.
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {preview.suggestions.map((suggestion) => {
                    const sourceLesson = sourceLessonById.get(suggestion.sourceLessonId);
                    const mapping = progressMappings.find(
                      (item) => item.sourceLessonId === suggestion.sourceLessonId
                    );
                    const confidence = CONFIDENCE_META[suggestion.confidence];

                    return (
                      <div key={suggestion.sourceLessonId} className="space-y-3 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{sourceLesson?.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {sourceLesson?.module.title} · {sourceLesson?.progress
                                ? STATUS_LABELS[sourceLesson.progress.status]
                                : "Нет прогресса"}
                            </div>
                          </div>
                          <Badge className={`${confidence.className} border-0`}>
                            {confidence.label}
                          </Badge>
                        </div>
                        <Select
                          value={mapping?.targetLessonId ?? "__skip__"}
                          onValueChange={(value) =>
                            setProgressMappings((current) =>
                              replaceProgressMapping(
                                current,
                                suggestion.sourceLessonId,
                                value === "__skip__" ? null : value
                              )
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">Не переносить</SelectItem>
                            {preview.targetLessons
                              .filter(
                                (lesson) =>
                                  lesson.id === mapping?.targetLessonId ||
                                  !mappedTargetIds.has(lesson.id)
                              )
                              .map((lesson) => (
                                <SelectItem key={lesson.id} value={lesson.id}>
                                  {lesson.module.title} — {lesson.title}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={
              !targetGroupId ||
              transferMutation.isPending ||
              (differentCourses && transferProgress && previewQuery.isLoading)
            }
            onClick={() => transferMutation.mutate()}
          >
            {transferMutation.isPending ? "Переводим…" : "Перевести"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
