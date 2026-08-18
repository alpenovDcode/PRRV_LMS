"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Play,
  CircleCheck,
  Lock,
  Clock,
  ChevronRight,
  CircleAlert,
  BarChart,
  CornerDownRight,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";

interface Lesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz";
  orderIndex: number;
  isFree: boolean;
  isAvailable: boolean;
  hasHomework?: boolean;
  availableDate?: string;
  progress?: {
    status: "completed" | "in_progress" | "not_started";
    watchedTime: number;
  };
}

interface Module {
  id: string;
  title: string;
  orderIndex: number;
  isAvailable?: boolean;
  availableDate?: string | null;
  accessReason?: string;
  lessons: Lesson[];
  children?: Module[];
}

interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  modules: Module[];
  progress: number;
  enrollment: {
    status: string;
    startDate: string;
    expiresAt: string | null;
  } | null;
  hasAccess?: boolean;
}

export default function CourseDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const queryClient = useQueryClient();

  const {
    data: course,
    isLoading,
    error,
  } = useQuery<CourseDetail>({
    queryKey: ["course", slug],
    queryFn: async () => {
      const response = await apiClient.get(`/courses/${slug}`);
      return response.data.data;
    },
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Auto-refresh: find the nearest upcoming unlock date and schedule a refetch
  useEffect(() => {
    if (!course) return;

    const getAllUnlockDates = (mods: Module[]): number[] =>
      mods.flatMap((module) => [
        ...(module.availableDate ? [new Date(module.availableDate).getTime()] : []),
        ...module.lessons
          .filter((lesson) => !lesson.isAvailable && lesson.availableDate)
          .map((lesson) => new Date(lesson.availableDate!).getTime()),
        ...(module.children ? getAllUnlockDates(module.children) : []),
      ]);

    const now = Date.now();
    const futureDates = getAllUnlockDates(course.modules).filter((time) => time > now);

    if (futureDates.length === 0) return;

    const nearestMs = Math.min(...futureDates);
    const msUntilUnlock = nearestMs - now;

    // Long browser timers are unreliable after sleep/background throttling.
    // Re-arm every 30 minutes until the exact opening moment is close.
    const nextCheckMs = Math.min(msUntilUnlock + 1500, 30 * 60 * 1000);

    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["course", slug] });
    }, nextCheckMs);

    return () => clearTimeout(timer);
  }, [course, slug, queryClient]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container mx-auto flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 rounded-full bg-red-50 p-4">
          <CircleAlert className="h-10 w-10 text-red-500" />
        </div>
        <h3 className="mb-2 text-2xl font-bold text-gray-900">Курс не найден</h3>
        <p className="mb-6 max-w-md text-gray-600">
          Возможно, курс был удален или у вас нет прав для его просмотра.
        </p>
        <Button asChild size="lg">
          <Link href="/courses">Вернуться в каталог</Link>
        </Button>
      </div>
    );
  }

  const sortedModules = [...course.modules].sort((a, b) => a.orderIndex - b.orderIndex);

  // Recursive function to get all lessons
  const getAllLessons = (modules: Module[]): Lesson[] => {
    return modules.flatMap((m) => [...m.lessons, ...(m.children ? getAllLessons(m.children) : [])]);
  };

  const allLessons = getAllLessons(sortedModules);
  const completedLessons = allLessons.filter((l) => l.progress?.status === "completed").length;
  const firstAvailableLesson =
    allLessons.find((l) => l.isAvailable && l.progress?.status !== "completed") ||
    allLessons.find((l) => l.isAvailable);

  const renderLesson = (lesson: Lesson, slug: string) => (
    <Link
      key={lesson.id}
      href={lesson.isAvailable ? `/learn/${slug}/${lesson.id}` : "#"}
      onClick={(e) => !lesson.isAvailable && e.preventDefault()}
      className={cn(
        "group flex items-center gap-4 px-6 py-4 transition-all duration-200",
        lesson.isAvailable
          ? "cursor-pointer hover:bg-blue-50/50"
          : "cursor-not-allowed bg-gray-50/50 opacity-60"
      )}
    >
      <div className="shrink-0">
        {lesson.progress?.status === "completed" ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <CircleCheck className="h-5 w-5 text-green-600" />
          </div>
        ) : lesson.isAvailable ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 transition-colors group-hover:bg-blue-200">
            <Play className="ml-0.5 h-4 w-4 text-blue-600" />
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <Lock className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h4
            className={cn(
              "truncate text-base font-medium",
              lesson.isAvailable ? "text-gray-900 group-hover:text-blue-700" : "text-gray-500"
            )}
          >
            {lesson.title}
          </h4>
          {lesson.type === "video" && (
            <Badge
              variant="secondary"
              className="h-5 bg-gray-100 px-1.5 text-[10px] uppercase tracking-wider text-gray-500"
            >
              Видео
            </Badge>
          )}
          {lesson.hasHomework && (
            <Badge
              variant="secondary"
              className="hidden h-5 border-indigo-100 bg-indigo-50 px-1.5 text-[10px] uppercase tracking-wider text-indigo-600 sm:inline-flex"
            >
              ДЗ
            </Badge>
          )}
        </div>
        {!lesson.isAvailable && lesson.availableDate && (
          <p className="flex items-center gap-1 text-xs font-medium text-orange-600">
            <Clock className="h-3 w-3" />
            Откроется {new Date(lesson.availableDate).toLocaleDateString("ru-RU")}
          </p>
        )}
      </div>

      {lesson.isAvailable && (
        <ChevronRight className="h-5 w-5 text-gray-300 transition-colors group-hover:text-blue-400" />
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Hero Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
            {/* Left Column: Content Info */}
            <div className="space-y-6 lg:col-span-2">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                  <Link href="/courses" className="hover:underline">
                    Курсы
                  </Link>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-900">{course.title}</span>
                </div>
                <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 md:text-4xl lg:text-5xl">
                  {course.title}
                </h1>
                {course.description && (
                  <p className="max-w-3xl text-lg leading-relaxed text-gray-600">
                    {course.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <Badge
                  variant="secondary"
                  className="border-blue-100 bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  {allLessons.length} уроков
                </Badge>
                <Badge
                  variant="secondary"
                  className="border-purple-100 bg-purple-50 px-3 py-1 text-sm text-purple-700 hover:bg-purple-100"
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  {sortedModules.length} модулей
                </Badge>
              </div>
            </div>

            {/* Right Column: Cover Image & Action Card (Desktop) */}
            <div className="hidden space-y-6 lg:block">
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-100 shadow-lg">
                {course.coverImage ? (
                  <Image
                    src={getCloudflareImageUrl(course.coverImage)}
                    alt={course.title}
                    fill
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                    <BookOpen className="h-16 w-16 text-white/80" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Content: Modules List */}
          <div className="space-y-8 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Программа курса</h2>
              <span className="text-sm text-gray-500">
                {completedLessons} из {allLessons.length} завершено
              </span>
            </div>

            <Card className="overflow-hidden border-gray-200 shadow-sm">
              <Accordion type="multiple" defaultValue={[sortedModules[0]?.id]} className="w-full">
                {sortedModules.map((module, index) => {
                  const sortedLessons = [...module.lessons].sort(
                    (a, b) => a.orderIndex - b.orderIndex
                  );
                  const sortedChildren = module.children
                    ? [...module.children].sort((a, b) => a.orderIndex - b.orderIndex)
                    : [];
                  const totalLessonsInModule =
                    module.lessons.length +
                    sortedChildren.reduce((acc, child) => acc + child.lessons.length, 0);

                  return (
                    <AccordionItem
                      key={module.id}
                      value={module.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <AccordionTrigger className="px-6 py-4 transition-colors hover:bg-gray-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                              {module.title}
                              {module.isAvailable === false && (
                                <Lock className="h-4 w-4 text-gray-400" />
                              )}
                            </h3>
                            <p className="text-sm font-normal text-gray-500">
                              {module.isAvailable === false && module.availableDate
                                ? `Откроется ${new Date(module.availableDate).toLocaleString("ru-RU")}`
                                : `${totalLessonsInModule} уроков`}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="divide-y divide-gray-100">
                          {sortedLessons.map((lesson) => renderLesson(lesson, slug))}
                        </div>

                        {/* Submodules */}
                        {sortedChildren.length > 0 && (
                          <div className="bg-gray-50/30">
                            {sortedChildren.map((submodule) => {
                              const subLessons = [...submodule.lessons].sort(
                                (a, b) => a.orderIndex - b.orderIndex
                              );
                              return (
                                <div key={submodule.id} className="border-t border-gray-100">
                                  <div className="flex items-center gap-2 bg-gray-50 px-6 py-3">
                                    <CornerDownRight className="h-4 w-4 text-gray-400" />
                                    <h4 className="font-medium text-gray-700">{submodule.title}</h4>
                                  </div>
                                  <div className="divide-y divide-gray-100 pl-6">
                                    {subLessons.map((lesson) => renderLesson(lesson, slug))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </Card>
          </div>

          {/* Sidebar: Status Card */}
          <div className="space-y-6 lg:col-span-1">
            {/* Mobile Cover Image (visible only on mobile) */}
            <div className="mb-6 overflow-hidden rounded-xl shadow-md lg:hidden">
              {course.coverImage ? (
                <div className="relative aspect-video w-full">
                  <Image
                    src={getCloudflareImageUrl(course.coverImage)}
                    alt={course.title}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                  <BookOpen className="h-12 w-12 text-white/80" />
                </div>
              )}
            </div>

            <div className="sticky top-6">
              {course.hasAccess && course.enrollment ? (
                <Card className="overflow-hidden border-blue-100 shadow-lg">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                    <h3 className="flex items-center gap-2 font-semibold text-white">
                      <CircleCheck className="h-5 w-5" />
                      Вы зачислены
                    </h3>
                  </div>
                  <CardContent className="space-y-6 pt-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">Прогресс курса</span>
                        <span className="font-bold text-blue-600">{course.progress}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                    </div>

                    {firstAvailableLesson ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-500">Следующий урок:</p>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="line-clamp-2 font-medium text-gray-900">
                            {firstAvailableLesson.title}
                          </p>
                        </div>
                        <Button
                          asChild
                          className="h-12 w-full bg-blue-600 text-lg shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
                        >
                          <Link href={`/learn/${slug}/${firstAvailableLesson.id}`}>
                            <Play className="mr-2 h-5 w-5 fill-current" />
                            {course.progress > 0 ? "Продолжить" : "Начать обучение"}
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <CircleCheck className="mx-auto mb-2 h-12 w-12 text-green-500" />
                        <p className="font-medium text-gray-900">Курс пройден!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-orange-200 bg-orange-50/50 shadow-lg">
                  <CardContent className="space-y-4 pt-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                      <Lock className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Доступ закрыт</h3>
                      <p className="mt-2 text-sm text-gray-600">
                        Вы не зачислены на этот курс. Для получения доступа обратитесь к
                        администратору или куратору.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-orange-200 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
                    >
                      Связаться с поддержкой
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
