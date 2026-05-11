"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Play,
  FileText,
  ClipboardCheck,
  ClipboardList,
  Award,
} from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  type: string;
  orderIndex: number;
  videoDuration?: number | null;
  isFree?: boolean;
  isStopLesson?: boolean;
}
interface Module {
  id: string;
  title: string;
  orderIndex: number;
  lessons: Lesson[];
}
interface CourseDetails {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  coverImage?: string | null;
  isPublished: boolean;
  modules: Module[];
}

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  video: { label: "Видео", icon: Play, color: "text-blue-600" },
  text: { label: "Текст", icon: FileText, color: "text-gray-600" },
  quiz: { label: "Тест", icon: ClipboardCheck, color: "text-purple-600" },
  track_definition: { label: "Опрос трека", icon: ClipboardList, color: "text-teal-600" },
  intermediate_survey: { label: "Опрос", icon: ClipboardList, color: "text-amber-600" },
  certification_form: { label: "Анкета сертификата", icon: Award, color: "text-emerald-600" },
};

function fmtDuration(sec?: number | null) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} мин${s ? ` ${s} с` : ""}` : `${s} с`;
}

export default function CuratorCourseDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());

  const { data: course, isLoading } = useQuery<CourseDetails>({
    queryKey: ["curator", "course", id],
    queryFn: async () => (await apiClient.get(`/admin/courses/${id}`)).data.data,
    enabled: !!id,
  });

  const toggle = (moduleId: string) =>
    setOpenModules((s) => {
      const n = new Set(s);
      n.has(moduleId) ? n.delete(moduleId) : n.add(moduleId);
      return n;
    });

  return (
    <CuratorLayout>
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Link
          href="/curator/courses"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" /> К списку курсов
        </Link>

        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : !course ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">Курс не найден</CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <BookOpen className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
                      <Badge
                        className={
                          "border-0 " +
                          (course.isPublished
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-700")
                        }
                      >
                        {course.isPublished ? "Опубликован" : "Черновик"}
                      </Badge>
                    </div>
                    {course.description && (
                      <p className="text-gray-600 mt-2 whitespace-pre-wrap">{course.description}</p>
                    )}
                    <div className="text-xs text-gray-500 mt-3">
                      Модулей: {course.modules.length} · Уроков:{" "}
                      {course.modules.reduce((acc, m) => acc + m.lessons.length, 0)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Структура курса</h2>
              {course.modules.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    В курсе пока нет модулей
                  </CardContent>
                </Card>
              )}
              {course.modules
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((m) => {
                  const isOpen = openModules.has(m.id);
                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen ? (
                            <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{m.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Уроков: {m.lessons.length}
                            </div>
                          </div>
                        </div>
                      </button>
                      {isOpen && m.lessons.length > 0 && (
                        <div className="border-t bg-gray-50">
                          {m.lessons
                            .slice()
                            .sort((a, b) => a.orderIndex - b.orderIndex)
                            .map((l) => {
                              const meta = TYPE_META[l.type] || {
                                label: l.type,
                                icon: FileText,
                                color: "text-gray-600",
                              };
                              const Icon = meta.icon;
                              const duration = fmtDuration(l.videoDuration);
                              return (
                                <div
                                  key={l.id}
                                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 bg-white"
                                >
                                  <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-900 truncate">{l.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                      <span>{meta.label}</span>
                                      {duration && <span>· {duration}</span>}
                                      {l.isFree && (
                                        <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">
                                          бесплатно
                                        </Badge>
                                      )}
                                      {l.isStopLesson && (
                                        <Badge className="bg-red-100 text-red-800 border-0 text-[10px]">
                                          стоп-урок
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                      {isOpen && m.lessons.length === 0 && (
                        <div className="border-t px-4 py-3 text-sm text-gray-500 bg-gray-50">
                          В модуле пока нет уроков
                        </div>
                      )}
                    </Card>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </CuratorLayout>
  );
}
