"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, Search, Download, AlertTriangle, Clock, CheckCircle, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";

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
  avgLessonRating: string | number;
  registrationDate: string;
  lastActivityAt: string | null;
  detailedStats: {
    homeworks: Array<{ id: string; lessonTitle: string; status: string; submittedAt: string }>;
    ratings: Array<{ lessonTitle: string; rating: number; ratedAt: string }>;
  };
}

type SortField = keyof Pick<
  StudentAnalytics,
  "name" | "group" | "course" | "track" | "lessonProgressPercent" | "submittedHomework" | "approvedHomework" | "registrationDate" | "lastActivityAt"
>;

type RiskFilter = "all" | "at_risk" | "inactive";

function getRiskLevel(lastActivityAt: string | null): "ok" | "at_risk" | "inactive" {
  if (!lastActivityAt) return "inactive";
  const days = differenceInDays(new Date(), new Date(lastActivityAt));
  if (days > 14) return "inactive";
  if (days > 7) return "at_risk";
  return "ok";
}

function RiskBadge({ level }: { level: "ok" | "at_risk" | "inactive" }) {
  if (level === "inactive") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Нет активности более 14 дней</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (level === "at_risk") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Нет активности 7–14 дней</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return null;
}

function LastActivityCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground text-sm">—</span>;
  const days = differenceInDays(new Date(), new Date(value));
  const color = days <= 3 ? "text-green-600" : days <= 7 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="text-sm">
      <span className={`font-medium ${color}`}>{days === 0 ? "сегодня" : `${days}д назад`}</span>
      <div className="text-xs text-muted-foreground">{format(new Date(value), "dd.MM.yyyy")}</div>
    </div>
  );
}

export function StudentsTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortField, setSortField] = useState<SortField>("registrationDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const { data: students, isLoading } = useQuery<StudentAnalytics[]>({
    queryKey: ["admin", "analytics", "students"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/students");
      return response.data.data;
    },
  });

  const groups = useMemo(() => {
    if (!students) return [];
    return Array.from(new Set(students.map((s) => s.group))).sort();
  }, [students]);

  // Pre-compute risk levels
  const studentsWithRisk = useMemo(() => {
    if (!students) return [];
    return students.map((s) => ({ ...s, riskLevel: getRiskLevel(s.lastActivityAt) }));
  }, [students]);

  // Risk counts for filter buttons
  const riskCounts = useMemo(() => ({
    at_risk: studentsWithRisk.filter((s) => s.riskLevel === "at_risk").length,
    inactive: studentsWithRisk.filter((s) => s.riskLevel === "inactive").length,
  }), [studentsWithRisk]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return studentsWithRisk.filter((s) => {
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.course.toLowerCase().includes(q);
      const matchGroup = groupFilter === "all" || s.group === groupFilter;
      const matchRisk =
        riskFilter === "all" ||
        (riskFilter === "at_risk" && s.riskLevel === "at_risk") ||
        (riskFilter === "inactive" && s.riskLevel === "inactive");
      return matchSearch && matchGroup && matchRisk;
    });
  }, [studentsWithRisk, searchTerm, groupFilter, riskFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDirection === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDirection === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortField, sortDirection]);

  const exportToCSV = () => {
    const headers = ["ФИО","Email","Группа","Курс","Трек","Пройдено","Всего","Прогресс %","ДЗ сдано","ДЗ принято","Последняя активность","Дата регистрации"];
    const rows = sorted.map((s) => [
      `"${s.name}"`, s.email, `"${s.group}"`, `"${s.course}"`, `"${s.track}"`,
      s.completedLessons, s.totalLessons, `${s.lessonProgressPercent}%`,
      s.submittedHomework, s.approvedHomework,
      s.lastActivityAt ? format(new Date(s.lastActivityAt), "dd.MM.yyyy") : "—",
      format(new Date(s.registrationDate), "dd.MM.yyyy"),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-28 ml-auto" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <Button variant="ghost" onClick={() => handleSort(field)} className="-ml-3 h-8 text-xs hover:bg-transparent px-3">
      {label}
      <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-50" />
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, email, группе..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={groupPopoverOpen}
              className="w-[220px] justify-between font-normal"
            >
              <span className="truncate">
                {groupFilter === "all" ? `Все группы (${students?.length ?? 0})` : groupFilter}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0">
            <Command>
              <CommandInput placeholder="Поиск группы..." />
              <CommandList>
                <CommandEmpty>Группа не найдена</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => { setGroupFilter("all"); setGroupPopoverOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", groupFilter === "all" ? "opacity-100" : "opacity-0")} />
                    Все группы ({students?.length ?? 0})
                  </CommandItem>
                  {groups.map((g) => {
                    const cnt = students?.filter((s) => s.group === g).length ?? 0;
                    return (
                      <CommandItem
                        key={g}
                        value={g}
                        onSelect={() => { setGroupFilter(g); setGroupPopoverOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", groupFilter === g ? "opacity-100" : "opacity-0")} />
                        {g}
                        <span className="ml-auto text-xs text-muted-foreground">{cnt}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={exportToCSV} className="ml-auto">
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
      </div>

      {/* Risk filter buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={riskFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setRiskFilter("all")}
          className="h-8 text-xs"
        >
          <CheckCircle className="mr-1.5 h-3 w-3" />
          Все студенты
        </Button>
        <Button
          variant={riskFilter === "at_risk" ? "default" : "outline"}
          size="sm"
          onClick={() => setRiskFilter("at_risk")}
          className={`h-8 text-xs ${riskFilter !== "at_risk" && riskCounts.at_risk > 0 ? "border-yellow-400 text-yellow-700" : ""}`}
        >
          <Clock className="mr-1.5 h-3 w-3" />
          Нет активности 7–14 дней
          {riskCounts.at_risk > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">{riskCounts.at_risk}</Badge>
          )}
        </Button>
        <Button
          variant={riskFilter === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() => setRiskFilter("inactive")}
          className={`h-8 text-xs ${riskFilter !== "inactive" && riskCounts.inactive > 0 ? "border-red-400 text-red-700" : ""}`}
        >
          <AlertTriangle className="mr-1.5 h-3 w-3" />
          Неактивны более 14 дней
          {riskCounts.inactive > 0 && (
            <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-xs">{riskCounts.inactive}</Badge>
          )}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="h-11 px-4 text-left font-medium text-muted-foreground">
                <SortBtn field="name" label="Студент" />
              </th>
              <th className="h-11 px-4 text-left font-medium text-muted-foreground">
                <SortBtn field="group" label="Группа" />
              </th>
              <th className="h-11 px-4 text-left font-medium text-muted-foreground">
                <SortBtn field="course" label="Курс" />
              </th>
              <th className="h-11 px-4 text-center font-medium text-muted-foreground">
                <SortBtn field="lessonProgressPercent" label="Прогресс" />
              </th>
              <th className="h-11 px-4 text-center font-medium text-muted-foreground">
                <SortBtn field="approvedHomework" label="ДЗ принято" />
              </th>
              <th className="h-11 px-4 text-center font-medium text-muted-foreground">
                <SortBtn field="lastActivityAt" label="Активность" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-24 text-center text-muted-foreground">
                  {riskFilter !== "all" ? "Нет студентов в этой категории" : "Нет студентов"}
                </td>
              </tr>
            ) : (
              sorted.map((student) => (
                <>
                  <tr
                    key={student.id}
                    className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${
                      student.riskLevel === "inactive"
                        ? "bg-red-50/40 dark:bg-red-950/10"
                        : student.riskLevel === "at_risk"
                        ? "bg-yellow-50/40 dark:bg-yellow-950/10"
                        : ""
                    }`}
                    onClick={() =>
                      setExpandedStudentId(expandedStudentId === student.id ? null : student.id)
                    }
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <RiskBadge level={student.riskLevel} />
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-xs text-muted-foreground">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{student.group}</td>
                    <td className="p-4 text-sm max-w-[200px] truncate">{student.course}</td>
                    <td className="p-4 text-center">
                      <div className="font-semibold">{student.lessonProgressPercent}%</div>
                      <div className="text-xs text-muted-foreground">
                        {student.completedLessons}/{student.totalLessons}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="font-semibold">{student.approvedHomework}</div>
                      <div className="text-xs text-muted-foreground">
                        из {student.submittedHomework} сдано
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <LastActivityCell value={student.lastActivityAt} />
                    </td>
                  </tr>
                  {expandedStudentId === student.id && (
                    <tr key={`${student.id}-detail`} className="bg-muted/20">
                      <td colSpan={6} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">
                              Домашние задания ({student.submittedHomework} сдано, {student.approvedHomework} принято)
                            </h4>
                            {student.detailedStats.homeworks.length > 0 ? (
                              <div className="rounded-md border bg-white overflow-auto max-h-48">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 border-b">
                                    <tr>
                                      <th className="p-2 text-left">Урок</th>
                                      <th className="p-2 text-center">Статус</th>
                                      <th className="p-2 text-right">Дата</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {student.detailedStats.homeworks.map((hw) => (
                                      <tr key={hw.id} className="border-b last:border-0">
                                        <td className="p-2">{hw.lessonTitle}</td>
                                        <td className="p-2 text-center">
                                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                            hw.status === "approved" ? "bg-green-100 text-green-700"
                                            : hw.status === "rejected" ? "bg-red-100 text-red-700"
                                            : "bg-yellow-100 text-yellow-700"
                                          }`}>
                                            {hw.status === "approved" ? "Принято" : hw.status === "rejected" ? "Отклонено" : "На проверке"}
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
                              <p className="text-xs text-muted-foreground">Нет домашних заданий</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">
                              Оценки студента урокам
                              <span className="ml-1 font-normal text-muted-foreground text-xs">
                                (насколько студент доволен контентом)
                              </span>
                            </h4>
                            {student.detailedStats.ratings.length > 0 ? (
                              <div className="rounded-md border bg-white overflow-auto max-h-48">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 border-b">
                                    <tr>
                                      <th className="p-2 text-left">Урок</th>
                                      <th className="p-2 text-center">Оценка</th>
                                      <th className="p-2 text-right">Дата</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {student.detailedStats.ratings.map((r, idx) => (
                                      <tr key={idx} className="border-b last:border-0">
                                        <td className="p-2">{r.lessonTitle}</td>
                                        <td className="p-2 text-center font-semibold">{r.rating}</td>
                                        <td className="p-2 text-right">
                                          {r.ratedAt ? format(new Date(r.ratedAt), "dd.MM.yyyy") : "—"}
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

      <div className="text-xs text-muted-foreground">
        Показано: {sorted.length} из {students?.length ?? 0} студентов
        {riskCounts.inactive > 0 && riskFilter === "all" && (
          <span className="ml-3 text-red-600 font-medium">
            ⚠ {riskCounts.inactive} студент{riskCounts.inactive > 1 ? "а" : ""} неактивн{riskCounts.inactive > 1 ? "ы" : ""} более 14 дней
          </span>
        )}
      </div>
    </div>
  );
}
