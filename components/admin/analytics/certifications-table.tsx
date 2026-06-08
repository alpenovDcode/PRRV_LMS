"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Award,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/**
 * Раздел «Сертификация» — все сабмишены на уроки типа certification_form
 * + сводка по статусам/курсам/среднему баллу + раскрытие конкретных
 * ответов студентов.
 *
 * Все запросы напрямую к /api/admin/analytics/certifications. Компонент
 * standalone — не зависит от глобальных фильтров страницы /admin/analytics
 * (на проде там могут быть свои фильтры, у нас — свои внутри).
 */

interface Group {
  id: string;
  name: string;
}
interface Course {
  id: string;
  title: string;
}
interface AnswerPair {
  question: string;
  answer: string;
}
interface CertificationItem {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  curatorComment: string | null;
  student: {
    id: string;
    fullName: string;
    email: string;
    groups: Group[];
  } | null;
  lesson: {
    id: string;
    title: string;
    module: {
      id: string;
      title: string;
      course: Course;
    } | null;
  } | null;
  curator: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  answers: AnswerPair[];
  testScore: number | null;
  testTotal: number | null;
}

interface Summary {
  total: number;
  byStatus: { pending: number; approved: number; rejected: number };
  avgScorePercent: number | null;
  scoredCount: number;
  byCourse: Array<{
    courseId: string;
    courseTitle: string;
    count: number;
    approved: number;
    rejected: number;
    pending: number;
  }>;
  byWeek: Array<{ week: string; count: number }>;
}

interface ApiResp {
  items: CertificationItem[];
  summary: Summary;
  filters: { courses: Course[]; groups: Group[] };
}

const STATUS_LABEL: Record<CertificationItem["status"], string> = {
  pending: "На проверке",
  approved: "Одобрено",
  rejected: "Отклонено",
};

function StatusBadge({ status }: { status: CertificationItem["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Одобрено
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Отклонено
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" /> На проверке
    </Badge>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Готовит CSV для экспорта: одна строка на сабмишен, все ответы
 * сериализованы в одну колонку «answers_json» (чтобы число колонок
 * не зависело от состава вопросов в разных уроках).
 */
function buildCsv(items: CertificationItem[]): string {
  const headers = [
    "submission_id",
    "student_name",
    "student_email",
    "groups",
    "course",
    "module",
    "lesson",
    "status",
    "test_score",
    "test_total",
    "test_percent",
    "created_at",
    "reviewed_at",
    "curator",
    "curator_comment",
    "answers_json",
  ];
  const esc = (s: string): string => {
    if (s === null || s === undefined) return "";
    const str = String(s);
    if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.join(",")];
  for (const it of items) {
    const pct =
      it.testScore !== null && it.testTotal && it.testTotal > 0
        ? Math.round((it.testScore / it.testTotal) * 100)
        : "";
    const answersJson = JSON.stringify(
      Object.fromEntries(it.answers.map((a) => [a.question, a.answer]))
    );
    lines.push(
      [
        esc(it.id),
        esc(it.student?.fullName ?? ""),
        esc(it.student?.email ?? ""),
        esc((it.student?.groups ?? []).map((g) => g.name).join(" | ")),
        esc(it.lesson?.module?.course?.title ?? ""),
        esc(it.lesson?.module?.title ?? ""),
        esc(it.lesson?.title ?? ""),
        esc(STATUS_LABEL[it.status]),
        esc(it.testScore !== null ? String(it.testScore) : ""),
        esc(it.testTotal !== null ? String(it.testTotal) : ""),
        esc(String(pct)),
        esc(it.createdAt),
        esc(it.reviewedAt ?? ""),
        esc(it.curator?.fullName ?? ""),
        esc(it.curatorComment ?? ""),
        esc(answersJson),
      ].join(",")
    );
  }
  // BOM, чтобы Excel в Windows открывал кириллицу нормально.
  return "﻿" + lines.join("\n");
}

export function CertificationsTable() {
  const [range, setRange] = useState("30d");
  const [courseId, setCourseId] = useState<string>("all");
  const [groupId, setGroupId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<ApiResp>({
    queryKey: [
      "admin",
      "analytics",
      "certifications",
      range,
      courseId,
      groupId,
      status,
      search,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("range", range);
      if (courseId !== "all") params.set("courseId", courseId);
      if (groupId !== "all") params.set("groupId", groupId);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const r = await apiClient.get(
        `/admin/analytics/certifications?${params.toString()}`
      );
      return r.data?.data as ApiResp;
    },
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const courses = data?.filters?.courses ?? [];
  const groups = data?.filters?.groups ?? [];

  const handleExport = () => {
    if (!items.length) return;
    const csv = buildCsv(items);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certifications_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalForPct = summary?.total ?? 0;
  const pctOf = (n: number) =>
    totalForPct > 0 ? Math.round((n / totalForPct) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ─── Сводка ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Award className="h-5 w-5" />}
          label="Всего сертификаций"
          value={summary?.total ?? 0}
          color="text-violet-600"
          isLoading={isLoading}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={`Одобрено (${pctOf(summary?.byStatus.approved ?? 0)}%)`}
          value={summary?.byStatus.approved ?? 0}
          color="text-emerald-600"
          isLoading={isLoading}
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label={`На проверке (${pctOf(summary?.byStatus.pending ?? 0)}%)`}
          value={summary?.byStatus.pending ?? 0}
          color="text-amber-600"
          isLoading={isLoading}
        />
        <StatCard
          icon={<XCircle className="h-5 w-5" />}
          label={`Отклонено (${pctOf(summary?.byStatus.rejected ?? 0)}%)`}
          value={summary?.byStatus.rejected ?? 0}
          color="text-rose-600"
          isLoading={isLoading}
        />
      </div>

      {/* Балл тестовой части — отдельной плашкой, чтобы не путать со
          статусами проверки куратором. */}
      {summary && summary.scoredCount > 0 && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                Средний балл тестовой части
              </div>
              <div className="text-xs text-muted-foreground">
                По {summary.scoredCount} сабмишенам, где есть _test_score
              </div>
            </div>
            <div className="text-2xl font-bold text-violet-700">
              {summary.avgScorePercent !== null
                ? `${summary.avgScorePercent}%`
                : "—"}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Топ-5 курсов */}
      {!!summary?.byCourse?.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Топ-5 курсов</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.byCourse.map((c) => (
              <div
                key={c.courseId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate flex-1">{c.courseTitle}</span>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{c.count}</Badge>
                  <Badge className="bg-emerald-600">{c.approved}</Badge>
                  <Badge className="bg-amber-500">{c.pending}</Badge>
                  <Badge variant="destructive">{c.rejected}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Фильтры ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Период
            </label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Последние 7 дней</SelectItem>
                <SelectItem value="30d">Последние 30 дней</SelectItem>
                <SelectItem value="90d">Последние 3 месяца</SelectItem>
                <SelectItem value="all">За всё время</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Курс
            </label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все курсы</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Группа
            </label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все группы</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Статус
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="pending">На проверке</SelectItem>
                <SelectItem value="approved">Одобрено</SelectItem>
                <SelectItem value="rejected">Отклонено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-muted-foreground mb-1">
              Поиск (ФИО, email)
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Иванов / @example.com"
                className="pl-8"
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!items.length}
            className="gap-1"
          >
            <Download className="h-4 w-4" /> Экспорт CSV
          </Button>
        </CardContent>
      </Card>

      {/* ─── Таблица ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Студент</TableHead>
                <TableHead>Курс / Урок</TableHead>
                <TableHead>Группа</TableHead>
                <TableHead>Подано</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Тест</TableHead>
                <TableHead>Куратор</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Загрузка…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Нет сертификационных анкет под выбранные фильтры
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => (
                <Fragment key={it.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => toggleRow(it.id)}
                  >
                    <TableCell className="w-10">
                      {expanded.has(it.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {it.student?.fullName ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.student?.email ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {it.lesson?.module?.course?.title ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.lesson?.title ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(it.student?.groups ?? []).map((g) => (
                          <Badge key={g.id} variant="outline" className="text-[10px]">
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtDate(it.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={it.status} />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {it.testScore !== null && it.testTotal
                        ? `${it.testScore}/${it.testTotal}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {it.curator?.fullName ?? "—"}
                    </TableCell>
                  </TableRow>
                  {expanded.has(it.id) && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={8} className="p-0">
                        <ExpandedAnswers item={it} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  isLoading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-0.5">
              {isLoading ? "…" : value.toLocaleString("ru-RU")}
            </div>
          </div>
          <div className={color}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpandedAnswers({ item }: { item: CertificationItem }) {
  // Группируем ответы по визуальным секциям: тестовая часть отделена
  // от анкеты. Распознаём её по ключу-маркеру (см. certification-form-viewer).
  const TEST_KEY = "Тестирование: правильных ответов";
  const formAnswers = useMemo(
    () => item.answers.filter((a) => a.question !== TEST_KEY),
    [item.answers]
  );
  const testAnswer = useMemo(
    () => item.answers.find((a) => a.question === TEST_KEY),
    [item.answers]
  );

  if (item.answers.length === 0) {
    return (
      <div className="px-6 py-4 text-sm text-muted-foreground">
        Ответы не сохранились — возможно, content имеет нестандартную
        структуру. Откройте сабмишен через раздел «Входящие ДЗ».
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4">
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Ответы на анкету
        </div>
        <div className="space-y-2">
          {formAnswers.map((a, i) => (
            <div
              key={i}
              className="rounded-md border bg-background p-3 text-sm"
            >
              <div className="text-xs text-muted-foreground mb-1">
                {a.question}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {a.answer || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {testAnswer && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Тестовая часть
          </div>
          <div className="rounded-md border bg-background p-3 text-sm">
            {testAnswer.answer}
          </div>
        </div>
      )}

      {item.curatorComment && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Комментарий куратора
          </div>
          <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap break-words">
            {item.curatorComment}
          </div>
        </div>
      )}
    </div>
  );
}
