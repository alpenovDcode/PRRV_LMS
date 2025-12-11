"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Play, 
  CheckCircle2, 
  Lock, 
  Clock, 
  ChevronRight,
  AlertCircle,
  BarChart,
  CornerDownRight
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

  const { data: course, isLoading, error } = useQuery<CourseDetail>({
    queryKey: ["course", slug],
    queryFn: async () => {
      const response = await apiClient.get(`/courses/${slug}`);
      return response.data.data;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-96 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Курс не найден</h3>
        <p className="text-gray-600 mb-6 max-w-md">
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
    return modules.flatMap(m => [
      ...m.lessons,
      ...(m.children ? getAllLessons(m.children) : [])
    ]);
  };

  const allLessons = getAllLessons(sortedModules);
  const completedLessons = allLessons.filter(l => l.progress?.status === "completed").length;
  const firstAvailableLesson = allLessons.find((l) => l.isAvailable && l.progress?.status !== "completed") || allLessons.find((l) => l.isAvailable);

  const renderLesson = (lesson: Lesson, slug: string) => (
    <Link
      key={lesson.id}
      href={lesson.isAvailable ? `/learn/${slug}/${lesson.id}` : "#"}
      onClick={(e) => !lesson.isAvailable && e.preventDefault()}
      className={cn(
        "flex items-center gap-4 px-6 py-4 transition-all duration-200 group",
        lesson.isAvailable 
          ? "hover:bg-blue-50/50 cursor-pointer" 
          : "opacity-60 cursor-not-allowed bg-gray-50/50"
      )}
    >
      <div className="shrink-0">
        {lesson.progress?.status === "completed" ? (
          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
        ) : lesson.isAvailable ? (
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <Play className="h-4 w-4 text-blue-600 ml-0.5" />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Lock className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className={cn(
            "font-medium text-base truncate",
            lesson.isAvailable ? "text-gray-900 group-hover:text-blue-700" : "text-gray-500"
          )}>
            {lesson.title}
          </h4>
          {lesson.type === "video" && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wider bg-gray-100 text-gray-500">
              Видео
            </Badge>
          )}
        </div>
        {!lesson.isAvailable && lesson.availableDate && (
          <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Откроется {new Date(lesson.availableDate).toLocaleDateString("ru-RU")}
          </p>
        )}
      </div>

      {lesson.isAvailable && (
        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-400 transition-colors" />
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Hero Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Content Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
                  <Link href="/courses" className="hover:underline">Курсы</Link>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-900">{course.title}</span>
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
                  {course.title}
                </h1>
                {course.description && (
                  <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
                    {course.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <Badge variant="secondary" className="px-3 py-1 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {allLessons.length} уроков
                </Badge>
                <Badge variant="secondary" className="px-3 py-1 text-sm bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-100">
                  <BarChart className="mr-2 h-4 w-4" />
                  {sortedModules.length} модулей
                </Badge>
              </div>
            </div>

            {/* Right Column: Cover Image & Action Card (Desktop) */}
            <div className="hidden lg:block space-y-6">
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-gray-100">
                {course.coverImage ? (
                  <Image
                    src={getCloudflareImageUrl(course.coverImage)}
                    alt={course.title}
                    fill
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <BookOpen className="h-16 w-16 text-white/80" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Modules List */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Программа курса</h2>
              <span className="text-sm text-gray-500">
                {completedLessons} из {allLessons.length} завершено
              </span>
            </div>

            <Card className="border-gray-200 shadow-sm overflow-hidden">
              <Accordion type="multiple" defaultValue={[sortedModules[0]?.id]} className="w-full">
                {sortedModules.map((module, index) => {
                  const sortedLessons = [...module.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
                  const sortedChildren = module.children ? [...module.children].sort((a, b) => a.orderIndex - b.orderIndex) : [];
                  const totalLessonsInModule = module.lessons.length + sortedChildren.reduce((acc, child) => acc + child.lessons.length, 0);

                  return (
                    <AccordionItem key={module.id} value={module.id} className="border-b border-gray-100 last:border-0">
                      <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-4 text-left">
                          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-lg">{module.title}</h3>
                            <p className="text-sm text-gray-500 font-normal">
                              {totalLessonsInModule} уроков
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="divide-y divide-gray-100">
                          {sortedLessons.map(lesson => renderLesson(lesson, slug))}
                        </div>
                        
                        {/* Submodules */}
                        {sortedChildren.length > 0 && (
                          <div className="bg-gray-50/30">
                            {sortedChildren.map((submodule) => {
                              const subLessons = [...submodule.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
                              return (
                                <div key={submodule.id} className="border-t border-gray-100">
                                  <div className="px-6 py-3 bg-gray-50 flex items-center gap-2">
                                    <CornerDownRight className="h-4 w-4 text-gray-400" />
                                    <h4 className="font-medium text-gray-700">{submodule.title}</h4>
                                  </div>
                                  <div className="divide-y divide-gray-100 pl-6">
                                    {subLessons.map(lesson => renderLesson(lesson, slug))}
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
          <div className="lg:col-span-1 space-y-6">
            {/* Mobile Cover Image (visible only on mobile) */}
            <div className="lg:hidden rounded-xl overflow-hidden shadow-md mb-6">
              {course.coverImage ? (
                <div className="relative aspect-video w-full">
                  <Image src={getCloudflareImageUrl(course.coverImage)} alt={course.title} fill className="object-cover" />
                </div>
              ) : (
                <div className="aspect-video w-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <BookOpen className="h-12 w-12 text-white/80" />
                </div>
              )}
            </div>

            <div className="sticky top-6">
              {course.hasAccess && course.enrollment ? (
                <Card className="border-blue-100 shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Вы зачислены
                    </h3>
                  </div>
                  <CardContent className="pt-6 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">Прогресс курса</span>
                        <span className="font-bold text-blue-600">{course.progress}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                    </div>

                    {firstAvailableLesson ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-500">Следующий урок:</p>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="font-medium text-gray-900 line-clamp-2">
                            {firstAvailableLesson.title}
                          </p>
                        </div>
                        <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg shadow-md hover:shadow-lg transition-all">
                          <Link href={`/learn/${slug}/${firstAvailableLesson.id}`}>
                            <Play className="mr-2 h-5 w-5 fill-current" />
                            {course.progress > 0 ? "Продолжить" : "Начать обучение"}
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="font-medium text-gray-900">Курс пройден!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-orange-200 shadow-lg bg-orange-50/50">
                  <CardContent className="pt-6 space-y-4 text-center">
                    <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                      <Lock className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Доступ закрыт</h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Вы не зачислены на этот курс. Для получения доступа обратитесь к администратору или куратору.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full border-orange-200 text-orange-700 hover:bg-orange-100 hover:text-orange-800">
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
