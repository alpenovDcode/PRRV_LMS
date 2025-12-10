"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Users, Layers, Activity, TrendingUp } from "lucide-react";
import { useState } from "react";

interface AdminStats {
  totalCourses: number;
  publishedCourses: number;
  totalUsers: number;
  students: number;
  curators: number;
  admins: number;
  groups: number;
  activeEnrollments: number;
}

interface DailyActivity {
  date: string;
  enrollments: number;
  progress: number;
  homework: number;
}

interface Analytics {
  recentActivity: {
    enrollments: number;
    progress: number;
    homework: number;
  };
  dailyActivity: DailyActivity[];
}

interface FunnelItem {
  lessonId: string;
  lessonTitle: string;
  lessonNumber: number;
  totalEnrollments: number;
  started: number;
  completed: number;
  completionRate: number;
  dropoffRate: number;
}

interface CourseFunnel {
  course: {
    id: string;
    title: string;
  };
  funnel: FunnelItem[];
}

export default function AdminDashboardPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/stats");
      return response.data.data;
    },
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["admin", "analytics"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics");
      return response.data.data;
    },
  });

  const { data: courses } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ["admin", "courses", "options"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  const { data: funnel, isLoading: funnelLoading } = useQuery<CourseFunnel>({
    queryKey: ["admin", "analytics", "funnel", selectedCourseId],
    queryFn: async () => {
      const params = new URLSearchParams({ courseId: selectedCourseId });
      const response = await apiClient.get(`/admin/analytics?${params.toString()}`);
      return response.data.data;
    },
    enabled: !!selectedCourseId,
  });

  const maxActivity = analytics?.dailyActivity
    ? Math.max(
        ...analytics.dailyActivity.map((d) => Math.max(d.enrollments, d.progress, d.homework))
      )
    : 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Обзор платформы</h1>
        <p className="text-gray-600 mt-2">
          Ключевые метрики по курсам, пользователям, активности и проходимости.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Курсы"
          icon={BookOpen}
          primary={stats?.totalCourses}
          secondary={`${stats?.publishedCourses ?? 0} опубликовано`}
          loading={statsLoading}
          color="blue"
        />
        <StatCard
          title="Пользователи"
          icon={Users}
          primary={stats?.totalUsers}
          secondary={`${stats?.students ?? 0} студентов`}
          loading={statsLoading}
          color="green"
        />
        <StatCard
          title="Группы"
          icon={Layers}
          primary={stats?.groups}
          secondary="Когорты и отделы"
          loading={statsLoading}
          color="purple"
        />
        <StatCard
          title="Активные доступы"
          icon={Activity}
          primary={stats?.activeEnrollments}
          secondary="Активные зачисления"
          loading={statsLoading}
          color="orange"
        />
      </div>

      {/* Recent activity */}
      {analytics && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Новые зачисления</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{analytics.recentActivity.enrollments}</div>
              <p className="text-xs text-gray-500 mt-1">За последние 7 дней</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Активность обучения</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{analytics.recentActivity.progress}</div>
              <p className="text-xs text-gray-500 mt-1">Обновлений прогресса за 7 дней</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Домашние задания</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{analytics.recentActivity.homework}</div>
              <p className="text-xs text-gray-500 mt-1">Отправлено за 7 дней</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily activity chart */}
      {analytics && analytics.dailyActivity && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Активность по дням</CardTitle>
            <CardDescription className="text-gray-600">
              График активности за последние 7 дней
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.dailyActivity.map((day, idx) => {
                const date = new Date(day.date);
                const dayName = date.toLocaleDateString("ru-RU", { weekday: "short" });
                const dayNumber = date.getDate();

                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">
                        {dayName}, {dayNumber}
                      </span>
                      <span className="text-gray-500">
                        Зачисления: {day.enrollments} • Прогресс: {day.progress} • ДЗ: {day.homework}
                      </span>
                    </div>
                    <div className="flex gap-2 h-4">
                      <div
                        className="bg-blue-500 rounded"
                        style={{
                          width: `${maxActivity > 0 ? (day.enrollments / maxActivity) * 100 : 0}%`,
                        }}
                        title={`Зачисления: ${day.enrollments}`}
                      />
                      <div
                        className="bg-green-500 rounded"
                        style={{
                          width: `${maxActivity > 0 ? (day.progress / maxActivity) * 100 : 0}%`,
                        }}
                        title={`Прогресс: ${day.progress}`}
                      />
                      <div
                        className="bg-purple-500 rounded"
                        style={{
                          width: `${maxActivity > 0 ? (day.homework / maxActivity) * 100 : 0}%`,
                        }}
                        title={`ДЗ: ${day.homework}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-500" />
                <span className="text-xs text-gray-600">Зачисления</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-green-500" />
                <span className="text-xs text-gray-600">Прогресс</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-purple-500" />
                <span className="text-xs text-gray-600">Домашние задания</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Funnel analysis */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Воронка проходимости курса</CardTitle>
          <CardDescription className="text-gray-600">
            Анализ проходимости уроков: сколько студентов дошли до каждого урока
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Выберите курс для анализа" />
              </SelectTrigger>
              <SelectContent>
                {courses?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {funnelLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : funnel && funnel.funnel.length > 0 ? (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">{funnel.course.title}</h3>
                <p className="text-sm text-gray-600">
                  Всего зачислений: {funnel.funnel[0]?.totalEnrollments || 0}
                </p>
              </div>
              {funnel.funnel.map((item, idx) => (
                <div
                  key={item.lessonId}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500">Урок {item.lessonNumber}:</span>
                        <span className="font-semibold text-gray-900">{item.lessonTitle}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Начали: {item.started}</span>
                        <span>Завершили: {item.completed}</span>
                        <span>Проходимость: {item.completionRate}%</span>
                        {item.dropoffRate > 0 && (
                          <span className="text-red-600">Отсев: -{item.dropoffRate}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                        <span>Проходимость</span>
                        <span>{item.completionRate}%</span>
                      </div>
                      <Progress value={item.completionRate} className="h-2" />
                    </div>
                    {idx > 0 && item.dropoffRate > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <p className="text-xs text-red-700">
                          ⚠️ Отсев {item.dropoffRate}% по сравнению с предыдущим уроком
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : selectedCourseId ? (
            <div className="text-center py-8 text-gray-500">
              <p>Нет данных для отображения воронки</p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Выберите курс для анализа воронки проходимости</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  icon: Icon,
  primary,
  secondary,
  loading,
  color = "blue",
}: {
  title: string;
  icon: React.ElementType;
  primary?: number;
  secondary?: string;
  loading: boolean;
  color?: "blue" | "green" | "purple" | "orange";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-gray-900">{primary ?? 0}</div>
            {secondary && <p className="text-xs text-gray-500 mt-1">{secondary}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
