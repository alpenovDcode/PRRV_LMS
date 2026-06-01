"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Activity, PlayCircle, BookOpen, TrendingUp } from "lucide-react";

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
    approvedCount: number;
    approvedPercent: number;
  };
  avgCourseProgressPercent: number;
}

interface StreamDetailProps {
  data: StreamData;
}

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  sub?: string;
  color: string;
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

export function StreamDetail({ data }: StreamDetailProps) {
  const { videoStats, hwStats } = data;
  const videoTotal = videoStats.notStarted + videoStats.partial + videoStats.completed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h3 className="text-xl font-semibold">{data.name}</h3>
          {data.courseTitle && (
            <p className="text-sm text-muted-foreground">{data.courseTitle}</p>
          )}
        </div>
        <Badge variant="secondary" className="ml-auto">
          <Users className="h-3 w-3 mr-1" />
          {data.memberCount} учеников
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          title="Учеников в потоке"
          value={String(data.memberCount)}
          color="text-blue-600"
        />
        <StatCard
          icon={Activity}
          title="Активность (7 дней)"
          value={`${data.activePercent}%`}
          sub="от общего числа"
          color="text-green-600"
        />
        <StatCard
          icon={BookOpen}
          title="ДЗ одобрено"
          value={`${hwStats.approvedPercent}%`}
          sub={`${hwStats.approvedCount} из ${hwStats.submittedCount} сданных`}
          color="text-orange-600"
        />
        <StatCard
          icon={TrendingUp}
          title="Ср. прохождение курса"
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
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {videoTotal === 0 ? (
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
              <p className="text-xs text-muted-foreground pt-1">
                * Процент от всех видео-уроков курса × количество учеников
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Course progress bar */}
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
            <Progress
              value={data.avgCourseProgressPercent}
              className="h-3 [&>div]:bg-purple-500"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
