"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Search, Download } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface StudentAnalytics {
  id: string;
  name: string;
  email: string;
  group: string;
  course: string;
  track: string;
  totalLessons: number;
  completedLessons: number;
  lessonProgressPercent: number;
  submittedHomework: number;
  approvedHomework: number;
  avgRating: string | number;
  registrationDate: string;
  detailedStats: {
    homeworks: Array<{
      id: string;
      lessonTitle: string;
      status: string;
      submittedAt: string;
    }>;
    ratings: Array<{
      lessonTitle: string;
      rating: number;
      ratedAt: string;
    }>;
  };
}

export function StudentsTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof StudentAnalytics>("registrationDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const { data: students, isLoading } = useQuery<StudentAnalytics[]>({
    queryKey: ["admin", "analytics", "students"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/students");
      return response.data.data;
    },
  });

  const handleSort = (field: keyof StudentAnalytics) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleExpand = (studentId: string) => {
    setExpandedStudentId(expandedStudentId === studentId ? null : studentId);
  };

  const filteredStudents = students?.filter((student) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      student.name.toLowerCase().includes(searchLower) ||
      student.email.toLowerCase().includes(searchLower) ||
      student.group.toLowerCase().includes(searchLower) ||
      student.course.toLowerCase().includes(searchLower) ||
      student.track.toLowerCase().includes(searchLower)
    );
  });

  const sortedStudents = filteredStudents?.sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const exportToCSV = () => {
    if (!sortedStudents) return;

    const headers = [
      "ФИО",
      "Email",
      "Группа",
      "Курс",
      "Трек",
      "Пройдено уроков",
      "Всего уроков",
      "% Прохождения",
      "Сдано ДЗ",
      "Принято ДЗ",
      "Ср. Оценка",
      "Дата регистрации",
    ];

    const csvContent = [
      headers.join(","),
      ...sortedStudents.map((s) =>
        [
          `"${s.name}"`,
          s.email,
          `"${s.group}"`,
          `"${s.course}"`,
          `"${s.track}"`,
          s.completedLessons,
          s.totalLessons,
          `${s.lessonProgressPercent}%`,
          s.submittedHomework,
          s.approvedHomework,
          s.avgRating,
          format(new Date(s.registrationDate), "dd.MM.yyyy"),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `students_analytics_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-10 w-[250px]" />
          <Skeleton className="h-10 w-[100px]" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, email, группе, треку..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={exportToCSV}>
          <Download className="mr-2 h-4 w-4" />
          Экспорт CSV
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm min-w-[800px]">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("name")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Студент
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("group")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Группа
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("course")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Курс
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("track")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Трек
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("lessonProgressPercent")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Прогресс
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("submittedHomework")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    ДЗ (Сдано)
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("approvedHomework")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    ДЗ (Принято)
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
                <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                  <Button variant="ghost" onClick={() => handleSort("avgRating")} className="-ml-4 h-8 text-xs hover:bg-transparent">
                    Оценка (Ср.)
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {sortedStudents?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-24 text-center">
                    Нет данных
                  </td>
                </tr>
              ) : (
                sortedStudents?.map((student) => (
                  <>
                    <tr
                      key={student.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
                      onClick={() => toggleExpand(student.id)}
                    >
                      <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-muted-foreground">{student.email}</div>
                      </td>
                      <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                        {student.group}
                      </td>
                      <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                        {student.course}
                      </td>
                      <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                        {student.track}
                      </td>
                      <td className="p-4 align-middle text-center [&:has([role=checkbox])]:pr-0">
                        <div className="flex flex-col items-center">
                          <span className="font-medium">{student.lessonProgressPercent}%</span>
                          <span className="text-xs text-muted-foreground">
                            {student.completedLessons} / {student.totalLessons}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-center [&:has([role=checkbox])]:pr-0">
                        {student.submittedHomework}
                      </td>
                      <td className="p-4 align-middle text-center [&:has([role=checkbox])]:pr-0">
                        {student.approvedHomework}
                      </td>
                      <td className="p-4 align-middle text-center [&:has([role=checkbox])]:pr-0">
                        {student.avgRating}
                      </td>
                    </tr>
                    {expandedStudentId === student.id && (
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Homework Stats */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Выполненные ДЗ</h4>
                              {student.detailedStats.homeworks.length > 0 ? (
                                <div className="rounded-md border bg-white">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b bg-muted/50">
                                        <th className="p-2 text-left">Урок</th>
                                        <th className="p-2 text-left">Статус</th>
                                        <th className="p-2 text-right">Дата</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {student.detailedStats.homeworks.map((hw) => (
                                        <tr key={hw.id} className="border-b last:border-0">
                                          <td className="p-2">{hw.lessonTitle}</td>
                                          <td className="p-2">
                                            <span
                                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                hw.status === "approved"
                                                  ? "bg-green-100 text-green-700"
                                                  : hw.status === "rejected"
                                                  ? "bg-red-100 text-red-700"
                                                  : "bg-yellow-100 text-yellow-700"
                                              }`}
                                            >
                                              {hw.status === "approved"
                                                ? "Принято"
                                                : hw.status === "rejected"
                                                ? "Отклонено"
                                                : "На проверке"}
                                            </span>
                                          </td>
                                          <td className="p-2 text-right">
                                            {format(new Date(hw.submittedAt), "dd.MM.yyyy")}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">Нет выполненных ДЗ</p>
                              )}
                            </div>

                            {/* Rating Stats */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Оценки за уроки</h4>
                              {student.detailedStats.ratings.length > 0 ? (
                                <div className="rounded-md border bg-white">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b bg-muted/50">
                                        <th className="p-2 text-left">Урок</th>
                                        <th className="p-2 text-center">Оценка</th>
                                        <th className="p-2 text-right">Дата</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {student.detailedStats.ratings.map((rating, idx) => (
                                        <tr key={idx} className="border-b last:border-0">
                                          <td className="p-2">{rating.lessonTitle}</td>
                                          <td className="p-2 text-center font-medium">
                                            {rating.rating}
                                          </td>
                                          <td className="p-2 text-right">
                                            {rating.ratedAt
                                              ? format(new Date(rating.ratedAt), "dd.MM.yyyy")
                                              : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">Нет оценок</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Всего студентов: {students?.length || 0}
      </div>
    </div>
  );
}
