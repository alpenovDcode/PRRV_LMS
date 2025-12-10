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
import { Badge } from "@/components/ui/badge";

interface CourseData {
  id: string;
  title: string;
  totalEnrollments: number;
  activeEnrollments: number;
  averageRating?: number;
}

interface CoursePerformanceProps {
  data: CourseData[];
  isLoading: boolean;
}

export function CoursePerformance({ data, isLoading }: CoursePerformanceProps) {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Показатели курсов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] flex items-center justify-center bg-muted/10 animate-pulse rounded-md">
            Загрузка данных...
          </div>
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

  // Вычисляем общую статистику
  const totalEnrollments = data.reduce((sum, course) => sum + course.totalEnrollments, 0);
  const totalActive = data.reduce((sum, course) => sum + course.activeEnrollments, 0);
  const avgRating = data.reduce((sum, course) => sum + (course.averageRating || 0), 0) / data.length;

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Показатели курсов</CardTitle>
        <div className="flex gap-4 mt-2 text-sm">
          <div>
            <span className="text-muted-foreground">Всего зачислений: </span>
            <span className="font-semibold">{totalEnrollments}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Активных: </span>
            <span className="font-semibold">{totalActive}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Средняя оценка: </span>
            <span className="font-semibold">{avgRating.toFixed(1)}/10</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Курс</TableHead>
                <TableHead className="text-right">Всего зачислений</TableHead>
                <TableHead className="text-right">Активные студенты</TableHead>
                <TableHead className="text-right">% Активности</TableHead>
                <TableHead className="text-right">Средняя оценка</TableHead>
                <TableHead className="text-right">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data
                .sort((a, b) => b.totalEnrollments - a.totalEnrollments)
                .map((course) => {
                  const activityPercent = course.totalEnrollments > 0
                    ? ((course.activeEnrollments / course.totalEnrollments) * 100).toFixed(1)
                    : "0";
                  const rating = course.averageRating || 0;

                  return (
                    <TableRow key={course.id}>
                      <TableCell className="font-medium max-w-xs">
                        {course.title}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {course.totalEnrollments}
                      </TableCell>
                      <TableCell className="text-right">
                        {course.activeEnrollments}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={
                          Number(activityPercent) >= 70 ? "text-green-600 font-semibold" :
                          Number(activityPercent) >= 40 ? "text-yellow-600" :
                          "text-red-600"
                        }>
                          {activityPercent}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={
                          rating >= 8 ? "text-green-600 font-semibold" :
                          rating >= 6 ? "text-yellow-600" :
                          rating > 0 ? "text-red-600" :
                          "text-muted-foreground"
                        }>
                          {rating > 0 ? `${rating.toFixed(1)}/10` : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(activityPercent) >= 70 ? (
                          <Badge variant="default" className="bg-green-600">Отлично</Badge>
                        ) : Number(activityPercent) >= 40 ? (
                          <Badge variant="secondary">Хорошо</Badge>
                        ) : (
                          <Badge variant="destructive">Низкая</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
