"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface CourseData {
  id: string;
  title: string;
  totalEnrollments: number;
  activeEnrollments: number;
  totalLessons: number;
  avgLessonRating: number;
  avgCompletionPercent: number;
}

interface CoursePerformanceProps {
  data: CourseData[];
  isLoading: boolean;
}

function ColoredPercent({ value }: { value: number }) {
  const color =
    value >= 70 ? "text-green-600" : value >= 40 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold ${color}`}>{value}%</span>;
}

export function CoursePerformance({ data, isLoading }: CoursePerformanceProps) {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Показатели курсов</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Показатели курсов</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Нет данных для отображения</p>
        </CardContent>
      </Card>
    );
  }

  const totalActive = data.reduce((s, c) => s + c.activeEnrollments, 0);
  const avgCompletion =
    data.length > 0
      ? Math.round(data.reduce((s, c) => s + c.avgCompletionPercent, 0) / data.length)
      : 0;

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Показатели курсов</CardTitle>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <span>
            <span className="text-muted-foreground">Активных студентов: </span>
            <span className="font-semibold">{totalActive}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Ср. прохождение: </span>
            <span className="font-semibold">{avgCompletion}%</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Курс</TableHead>
                <TableHead className="text-center">Уроков</TableHead>
                <TableHead className="text-center">Активных</TableHead>
                <TableHead className="text-center min-w-[160px]">Ср. прохождение</TableHead>
                <TableHead className="text-center">Оценка уроков*</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data
                .sort((a, b) => b.activeEnrollments - a.activeEnrollments)
                .map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium max-w-[260px]">
                      {course.title}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {course.totalLessons}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {course.activeEnrollments}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress
                          value={course.avgCompletionPercent}
                          className="h-2 w-20 [&>div]:bg-blue-500"
                        />
                        <ColoredPercent value={course.avgCompletionPercent} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {course.avgLessonRating > 0 ? (
                        <span
                          className={
                            course.avgLessonRating >= 8
                              ? "text-green-600 font-semibold"
                              : course.avgLessonRating >= 6
                              ? "text-yellow-600"
                              : "text-red-600"
                          }
                        >
                          {course.avgLessonRating}/10
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          * Средняя оценка, которую студенты ставят урокам (удовлетворённость контентом)
        </p>
      </CardContent>
    </Card>
  );
}
