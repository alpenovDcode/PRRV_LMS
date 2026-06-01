"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import type { StreamData } from "@/components/admin/analytics/stream-detail";

interface GroupLessonViewsTableProps {
  data: StreamData[] | undefined;
  isLoading: boolean;
}

function PctCell({ value, thresholds = [70, 40] }: { value: number; thresholds?: [number, number] }) {
  const [hi, mid] = thresholds;
  const color = value >= hi ? "text-green-600" : value >= mid ? "text-yellow-600" : "text-red-600";
  return (
    <div className="flex items-center gap-2 justify-end">
      <Progress
        value={value}
        className="h-1.5 w-16 shrink-0 [&>div]:bg-current"
      />
      <span className={`font-semibold tabular-nums w-10 text-right ${color}`}>{value}%</span>
    </div>
  );
}

export function GroupLessonViewsChart({ data: streams, isLoading }: GroupLessonViewsTableProps) {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader><CardTitle>Сводка по потокам</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!streams || streams.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader><CardTitle>Сводка по потокам</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Нет данных для отображения</p>
        </CardContent>
      </Card>
    );
  }

  const totalStudents = streams.reduce((s, g) => s + g.memberCount, 0);
  const avgActive = streams.length
    ? Math.round(streams.reduce((s, g) => s + g.activePercent, 0) / streams.length)
    : 0;
  const avgProgress = streams.length
    ? Math.round(streams.reduce((s, g) => s + g.avgCourseProgressPercent, 0) / streams.length)
    : 0;

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Сводка по потокам</CardTitle>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <span>
            <span className="text-muted-foreground">Всего студентов: </span>
            <span className="font-semibold">{totalStudents}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Ср. активность: </span>
            <span className="font-semibold">{avgActive}%</span>
          </span>
          <span>
            <span className="text-muted-foreground">Ср. прогресс: </span>
            <span className="font-semibold">{avgProgress}%</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[480px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Поток</TableHead>
                <TableHead className="text-center">Учеников</TableHead>
                <TableHead className="text-right">Активность (7д)</TableHead>
                <TableHead className="text-right">ДЗ одобрено</TableHead>
                <TableHead className="text-right">Прогресс курса</TableHead>
                <TableHead className="text-right">Видео просм.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {streams
                .sort((a, b) => b.avgCourseProgressPercent - a.avgCourseProgressPercent)
                .map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="font-medium">{g.name}</div>
                      {g.courseTitle && (
                        <div className="text-xs text-muted-foreground">{g.courseTitle}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {g.memberCount}
                      </div>
                    </TableCell>
                    <TableCell><PctCell value={g.activePercent} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {g.hwStats.approvedCount}/{g.hwStats.submittedCount}
                        </span>
                        <PctCell value={g.hwStats.approvedPercent} />
                      </div>
                    </TableCell>
                    <TableCell><PctCell value={g.avgCourseProgressPercent} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
                        <span className="text-green-600">{g.videoStats.completed}% досм.</span>
                        <span className="text-yellow-600">{g.videoStats.partial}% частично</span>
                        <span className="text-red-500">{g.videoStats.notStarted}% не смотр.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Активность — студенты с прогрессом за последние 7 дней. Подробнее — вкладка «Потоки».
        </p>
      </CardContent>
    </Card>
  );
}
