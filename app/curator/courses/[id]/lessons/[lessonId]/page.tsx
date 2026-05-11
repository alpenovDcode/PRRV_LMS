"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Eye } from "lucide-react";
import { LessonContentPlayer } from "@/components/learn/lesson-content-player";

interface LessonPreview {
  id: string;
  title: string;
  type: string;
  content: any;
  videoId?: string | null;
  videoDuration?: number | null;
  thumbnailUrl?: string | null;
  isFree?: boolean;
  isStopLesson?: boolean;
  settings?: any;
  module?: {
    id: string;
    title: string;
    course: { id: string; title: string; slug: string };
  } | null;
}

const TYPE_LABEL: Record<string, string> = {
  video: "Видеоурок",
  text: "Текстовый урок",
  quiz: "Тест",
  track_definition: "Определение трека",
  intermediate_survey: "Промежуточный опрос",
  certification_form: "Анкета сертификата",
};

export default function CuratorLessonPreviewPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();

  const { data: lesson, isLoading, error } = useQuery<LessonPreview>({
    queryKey: ["curator", "lesson", lessonId],
    queryFn: async () => (await apiClient.get(`/curator/lessons/${lessonId}`)).data.data,
    enabled: !!lessonId,
  });

  return (
    <CuratorLayout>
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Link
          href={`/curator/courses/${id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" /> К структуре курса
        </Link>

        {isLoading ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : error || !lesson ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              Урок не найден или нет доступа
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {lesson.module?.course && (
                      <p className="text-xs text-gray-500 mb-1">
                        {lesson.module.course.title}
                        {lesson.module.title && <> · {lesson.module.title}</>}
                      </p>
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge className="bg-blue-100 text-blue-800 border-0">
                        {TYPE_LABEL[lesson.type] || lesson.type}
                      </Badge>
                      <Badge className="bg-amber-100 text-amber-800 border-0 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Режим просмотра
                      </Badge>
                      {lesson.isFree && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-0">бесплатно</Badge>
                      )}
                      {lesson.isStopLesson && (
                        <Badge className="bg-red-100 text-red-800 border-0">стоп-урок</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <LessonContentPlayer lesson={lesson as any} isPreview />
          </>
        )}
      </div>
    </CuratorLayout>
  );
}
