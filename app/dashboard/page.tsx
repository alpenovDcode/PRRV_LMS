"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Play, TrendingUp, Award, Clock, ArrowRight, AlertCircle, Calendar } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  progress: number;
  lastLessonId: string | null;
}

interface DashboardStats {
  totalCourses: number;
  inProgress: number;
  completed: number;
  totalLessons: number;
  completedLessons: number;
}

interface ContinueLesson {
  course: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    coverImage: string | null;
  };
  lesson: {
    id: string;
    title: string;
    type: string;
  };
  watchedTime: number;
  videoDuration: number;
  watchedPercent: number;
  lastAccessed: string;
}

interface Deadline {
  id: string;
  lessonTitle: string;
  courseTitle: string;
  deadline: string;
  daysLeft: number;
  status: "pending" | "submitted" | "overdue";
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function DashboardPage() {
  // Убеждаемся, что все данные инициализированы как массивы
  const { data: courses = [], isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ["dashboard", "courses"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/courses/my");
        const data = response.data.data;
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("Failed to load courses:", error);
        return [];
      }
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/dashboard/stats");
        return response.data.data || {
          totalCourses: 0,
          inProgress: 0,
          completed: 0,
          totalLessons: 0,
          completedLessons: 0,
        };
      } catch (error) {
        console.error("Failed to load stats:", error);
        return {
          totalCourses: 0,
          inProgress: 0,
          completed: 0,
          totalLessons: 0,
          completedLessons: 0,
        };
      }
    },
  });

  const { data: continueLesson, isLoading: continueLoading } = useQuery<ContinueLesson | null>({
    queryKey: ["dashboard", "continue"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/dashboard/continue");
        return response.data.data || null;
      } catch (error) {
        console.error("Failed to load continue lesson:", error);
        return null;
      }
    },
  });

  const { data: deadlines = [], isLoading: deadlinesLoading } = useQuery<Deadline[]>({
    queryKey: ["dashboard", "deadlines"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/dashboard/deadlines");
        const data = response.data.data;
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("Failed to load deadlines:", error);
        return [];
      }
    },
  });

  // Убеждаемся, что courses и deadlines всегда массивы
  const safeCourses = Array.isArray(courses) ? courses : [];
  const safeDeadlines = Array.isArray(deadlines) ? deadlines : [];

  if (coursesLoading || statsLoading || continueLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      {/* Welcome section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Добро пожаловать обратно!
        </h1>
        <p className="text-gray-600">
          У вас {stats?.inProgress || 0} активных курсов и {stats?.completedLessons || 0} завершенных уроков
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Всего курсов</CardTitle>
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stats?.totalCourses || 0}</div>
                <p className="text-xs text-gray-500 mt-1">
                  {stats?.inProgress || 0} в процессе
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Завершено</CardTitle>
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Award className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stats?.completed || 0}</div>
                <p className="text-xs text-gray-500 mt-1">курсов</p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Уроков пройдено</CardTitle>
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {stats?.completedLessons || 0} / {stats?.totalLessons || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {stats?.totalLessons
                    ? Math.round(((stats.completedLessons || 0) / stats.totalLessons) * 100)
                    : 0}
                  % завершено
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Время обучения</CardTitle>
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">--</div>
                <p className="text-xs text-gray-500 mt-1">часов</p>
              </CardContent>
            </Card>
          </div>

          {/* Прямо сейчас - Continue learning */}
          {continueLesson ? (
            <Card className="border-2 border-blue-200 shadow-lg bg-white">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Прямо сейчас</CardTitle>
                <CardDescription className="text-gray-600">
                  Последний просмотренный урок
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-6">
                  {continueLesson.course.coverImage ? (
                    <div className="relative w-full md:w-48 h-32 rounded-lg overflow-hidden bg-gray-100 shadow-md">
                      <Image
                        src={getCloudflareImageUrl(continueLesson.course.coverImage)}
                        alt={continueLesson.course.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="relative w-full md:w-48 h-32 rounded-lg overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                      <BookOpen className="h-12 w-12 text-white opacity-80" />
                    </div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{continueLesson.course.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{continueLesson.lesson.title}</p>
                      {continueLesson.lesson.type === "video" && continueLesson.videoDuration > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-4 w-4" />
                          <span>
                            Продолжить с {formatTime(continueLesson.watchedTime)} / {formatTime(continueLesson.videoDuration)}
                          </span>
                        </div>
                      )}
                    </div>
                    {continueLesson.lesson.type === "video" && continueLesson.videoDuration > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Просмотрено</span>
                          <span className="font-semibold text-gray-900">{continueLesson.watchedPercent}%</span>
                        </div>
                        <Progress value={continueLesson.watchedPercent} className="h-2" />
                      </div>
                    )}
                    <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Link href={`/learn/${continueLesson.course.slug}/${continueLesson.lesson.id}`}>
                        <Play className="mr-2 h-4 w-4" />
                        Продолжить с {continueLesson.lesson.type === "video" && continueLesson.videoDuration > 0 
                          ? formatTime(continueLesson.watchedTime) 
                          : "начала"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Play className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Начните обучение</h3>
                <p className="text-sm text-gray-600 text-center mb-4">
                  Выберите курс и начните просмотр первого урока
                </p>
                <Button asChild variant="outline" className="border-gray-300">
                  <Link href="/courses">Выбрать курс</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* My courses */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Мои курсы</h2>
                <p className="text-sm text-gray-600 mt-1">Управляйте своим обучением и отслеживайте прогресс</p>
              </div>
              <Button variant="outline" asChild className="border-gray-300">
                <Link href="/courses">
                  Все курсы
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {safeCourses && safeCourses.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {safeCourses.map((course) => (
                  <Card 
                    key={course.id} 
                    className="overflow-hidden hover:shadow-lg transition-all duration-200 border-gray-200 bg-white group"
                  >
                    {course.coverImage ? (
                      <div className="relative w-full h-48 bg-gray-100">
                        <Image
                          src={getCloudflareImageUrl(course.coverImage)}
                          alt={course.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                    ) : (
                      <div className="relative w-full h-48 bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                        <BookOpen className="h-16 w-16 text-white opacity-80" />
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="line-clamp-2 text-gray-900">{course.title}</CardTitle>
                      {course.description && (
                        <CardDescription className="line-clamp-2 text-gray-600">
                          {course.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Прогресс</span>
                          <span className="font-semibold text-gray-900">{course.progress}%</span>
                        </div>
                        <Progress value={course.progress} className="h-2" />
                      </div>
                      <Button asChild variant="outline" className="w-full border-gray-300 hover:bg-blue-50 hover:border-blue-300">
                        <Link href={`/courses/${course.slug}`}>
                          Продолжить обучение
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                    <BookOpen className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">У вас пока нет курсов</h3>
                  <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
                    Начните обучение, выбрав курс из каталога
                  </p>
                  <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href="/courses">Перейти к каталогу</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Sidebar - Deadlines */}
        <div className="space-y-6">
          <Card className="border-gray-200 shadow-sm sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Дедлайны
              </CardTitle>
              <CardDescription className="text-gray-600">
                Ближайшие задания
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deadlinesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : safeDeadlines && safeDeadlines.length > 0 ? (
                <div className="space-y-3">
                  {safeDeadlines.map((deadline) => (
                    <div
                      key={deadline.id}
                      className={`p-3 rounded-lg border ${
                        deadline.status === "overdue"
                          ? "bg-red-50 border-red-200"
                          : deadline.status === "submitted"
                            ? "bg-green-50 border-green-200"
                            : "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {deadline.lessonTitle}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {deadline.courseTitle}
                          </p>
                        </div>
                        {deadline.status === "overdue" && (
                          <Badge variant="destructive" className="ml-2">Просрочено</Badge>
                        )}
                        {deadline.status === "submitted" && (
                          <Badge className="ml-2 bg-green-600">Сдано</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <AlertCircle className="h-3 w-3" />
                        {deadline.status === "overdue" ? (
                          <span className="text-red-600 font-medium">
                            Просрочено на {Math.abs(deadline.daysLeft)} дн.
                          </span>
                        ) : deadline.status === "submitted" ? (
                          <span className="text-green-600">Отправлено</span>
                        ) : deadline.daysLeft === 0 ? (
                          <span className="text-orange-600 font-medium">Сегодня</span>
                        ) : deadline.daysLeft === 1 ? (
                          <span className="text-orange-600 font-medium">Завтра</span>
                        ) : (
                          <span>Осталось {deadline.daysLeft} дн.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Нет ближайших дедлайнов</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
