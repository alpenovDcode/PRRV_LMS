"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

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

type SortField = "title" | "activeEnrollments" | "avgCompletionPercent" | "avgLessonRating";

function ColoredPercent({ value }: { value: number }) {
  const color = value >= 70 ? "text-green-600" : value >= 40 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold ${color}`}>{value}%</span>;
}

export function CoursePerformance({ data, isLoading }: CoursePerformanceProps) {
  const [sortField, setSortField] = useState<SortField>("activeEnrollments");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader><CardTitle>Показатели курсов</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader><CardTitle>Показатели курсов</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Нет данных для отображения</p></CardContent>
      </Card>
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "title" ? "asc" : "desc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const totalActive = data.reduce((s, c) => s + c.activeEnrollments, 0);
  const avgCompletion = data.length > 0
    ? Math.round(data.reduce((s, c) => s + c.avgCompletionPercent, 0) / data.length)
    : 0;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const Th = ({ field, label, align = "center" }: { field: SortField; label: string; align?: string }) => (
    <TableHead className={`text-${align}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleSort(field)}
        className={`-ml-2 h-7 px-2 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground ${sortField === field ? "text-foreground" : ""}`}
      >
        {label}
        <SortIcon field={field} />
      </Button>
    </TableHead>
  );

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
                <Th field="title" label="Курс" align="left" />
                <TableHead className="text-center text-xs text-muted-foreground">Уроков</TableHead>
                <Th field="activeEnrollments" label="Активных" />
                <Th field="avgCompletionPercent" label="Ср. прохождение" />
                <Th field="avgLessonRating" label="Оценка уроков*" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium max-w-[260px]">{course.title}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{course.totalLessons}</TableCell>
                  <TableCell className="text-center font-semibold">{course.activeEnrollments}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2 justify-end">
                      <Progress value={course.avgCompletionPercent} className="h-2 w-20 [&>div]:bg-blue-500" />
                      <ColoredPercent value={course.avgCompletionPercent} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {course.avgLessonRating > 0 ? (
                      <span className={
                        course.avgLessonRating >= 8 ? "text-green-600 font-semibold"
                        : course.avgLessonRating >= 6 ? "text-yellow-600"
                        : "text-red-600"
                      }>
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
