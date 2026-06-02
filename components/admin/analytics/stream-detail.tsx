"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Activity, PlayCircle, BookOpen, TrendingUp, ChevronDown, ChevronUp, AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { differenceInDays, format } from "date-fns";

export interface StreamData {
  id: string;
  name: string;
  courseTitle: string | null;
  memberCount: number;
  activePercent: number;
  videoStats: {
    notStarted: number;
    partial: number;
    completed: number;
  };
  hwStats: {
    submittedCount: number;
    pendingCount: number;
    approvedCount: number;
    approvedPercent: number;
  };
  avgCourseProgressPercent: number;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  group: string;
  lessonProgressPercent: number;
  completedLessons: number;
  totalLessons: number;
  submittedHomework: number;
  approvedHomework: number;
  lastActivityAt: string | null;
}

function getRisk(lastActivityAt: string | null): "ok" | "at_risk" | "inactive" {
  if (!lastActivityAt) return "inactive";
  const days = differenceInDays(new Date(), new Date(lastActivityAt));
  if (days > 14) return "inactive";
  if (days > 7) return "at_risk";
  return "ok";
}

function StatCard({ icon: Icon, title, value, sub, color }: {
  icon: React.ElementType; title: string; value: string; sub?: string; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-opacity-10 ${color.replace("text-", "bg-")}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LastActivity({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const days = differenceInDays(new Date(), new Date(value));
  const color = days <= 3 ? "text-green-600" : days <= 7 ? "text-yellow-600" : "text-red-500";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {days === 0 ? "сегодня" : `${days}д назад`}
    </span>
  );
}

export function StreamDetail({ data }: { data: StreamData }) {
  const { videoStats, hwStats } = data;
  const [showStudents, setShowStudents] = useState(false);

  const { data: streamStudents = [], isLoading: loadingStudents } = useQuery<StudentRow[]>({
    queryKey: ["admin", "analytics", "stream-students", data.id],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/analytics/streams/${data.id}/students`);
      return res.data.data;
    },
    enabled: showStudents,
    staleTime: 5 * 60 * 1000,
  });

  const riskCounts = useMemo(() => ({
    inactive: streamStudents.filter((s) => getRisk(s.lastActivityAt) === "inactive").length,
    at_risk: streamStudents.filter((s) => getRisk(s.lastActivityAt) === "at_risk").length,
  }), [streamStudents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h3 className="text-xl font-semibold">{data.name}</h3>
          {data.courseTitle && <p className="text-sm text-muted-foreground">{data.courseTitle}</p>}
        </div>
        <Badge variant="secondary" className="ml-auto">
          <Users className="h-3 w-3 mr-1" />
          {data.memberCount} учеников
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} title="Учеников в потоке" value={String(data.memberCount)} color="text-blue-600" />
        <StatCard
          icon={Activity}
          title="Активность (7 дней)"
          value={`${data.activePercent}%`}
          sub="уроки своего курса"
          color="text-green-600"
        />
        <StatCard
          icon={BookOpen}
          title="Приёмка ДЗ"
          value={`${hwStats.approvedPercent}%`}
          sub={`${hwStats.approvedCount} принято · ${hwStats.pendingCount} на проверке`}
          color="text-orange-600"
        />
        <StatCard
          icon={TrendingUp}
          title="Ср. прохождение"
          value={`${data.avgCourseProgressPercent}%`}
          sub="уроков завершено"
          color="text-purple-600"
        />
      </div>

      {/* Video stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-blue-500" />
            Просмотр видео-уроков
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  Процент считается от всех пар «студент × видеоурок».
                  Например, 5 студентов × 10 видео = 50 пар.
                  Если 20 пар просмотрено — показывает 40%.
                  Это означает, что в среднем студент посмотрел 4 из 10 видео.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.memberCount === 0 || (videoStats.notStarted === 0 && videoStats.partial === 0 && videoStats.completed === 0) ? (
            <p className="text-sm text-muted-foreground">Видео-уроки не найдены в курсе</p>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Не смотрели</span>
                  <span className="font-medium text-red-600">{videoStats.notStarted}%</span>
                </div>
                <Progress value={videoStats.notStarted} className="h-2 [&>div]:bg-red-400" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Не досмотрели</span>
                  <span className="font-medium text-yellow-600">{videoStats.partial}%</span>
                </div>
                <Progress value={videoStats.partial} className="h-2 [&>div]:bg-yellow-400" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Просмотрели полностью</span>
                  <span className="font-medium text-green-600">{videoStats.completed}%</span>
                </div>
                <Progress value={videoStats.completed} className="h-2 [&>div]:bg-green-500" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Course progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-500" />
            Среднее прохождение курса
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Средний % завершённых уроков</span>
              <span className="font-bold text-purple-600">{data.avgCourseProgressPercent}%</span>
            </div>
            <Progress value={data.avgCourseProgressPercent} className="h-3 [&>div]:bg-purple-500" />
          </div>
        </CardContent>
      </Card>

      {/* Student drill-down */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              Студенты потока
              {riskCounts.inactive > 0 && (
                <Badge variant="destructive" className="text-xs h-5">
                  {riskCounts.inactive} неактивны
                </Badge>
              )}
              {riskCounts.at_risk > 0 && (
                <Badge className="text-xs h-5 bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                  {riskCounts.at_risk} под риском
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStudents((v) => !v)}
              className="h-8 text-xs"
            >
              {showStudents ? (
                <><ChevronUp className="h-3.5 w-3.5 mr-1" />Скрыть</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5 mr-1" />Показать</>
              )}
            </Button>
          </div>
        </CardHeader>

        {showStudents && (
          <CardContent>
            {loadingStudents ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : streamStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет студентов</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left p-2 font-medium text-muted-foreground">Студент</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Прогресс</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">ДЗ принято</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Активность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamStudents.map((s) => {
                      const risk = getRisk(s.lastActivityAt);
                      return (
                        <tr
                          key={s.id}
                          className={`border-b last:border-0 ${
                            risk === "inactive" ? "bg-red-50/50 dark:bg-red-950/10"
                            : risk === "at_risk" ? "bg-yellow-50/50 dark:bg-yellow-950/10"
                            : ""
                          }`}
                        >
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              {risk === "inactive" && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                              {risk === "at_risk" && <Clock className="h-3 w-3 text-yellow-500 shrink-0" />}
                              <div>
                                <div className="font-medium text-sm">{s.name}</div>
                                <div className="text-xs text-muted-foreground">{s.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <div className="font-semibold text-sm">{s.lessonProgressPercent}%</div>
                            <div className="text-xs text-muted-foreground">{s.completedLessons}/{s.totalLessons}</div>
                          </td>
                          <td className="p-2 text-center">
                            <div className="font-semibold text-sm">{s.approvedHomework}</div>
                            <div className="text-xs text-muted-foreground">из {s.submittedHomework}</div>
                          </td>
                          <td className="p-2 text-center">
                            <LastActivity value={s.lastActivityAt} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
