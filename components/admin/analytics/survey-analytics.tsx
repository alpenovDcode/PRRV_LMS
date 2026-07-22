"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, MessageSquare, Award, TableIcon, Download } from "lucide-react";
import { useState } from "react";
import { SurveyResponsesTable } from "./survey-responses-table";

interface GroupNPS {
  groupId: string;
  groupName: string;
  responseCount: number;
  nps: number | null;
  promoters: number;
  detractors: number;
  neutrals: number;
  total: number;
  startDate?: string | null;
  endDate?: string | null;
}

interface SurveyResult extends GroupNPS {
  avgScores?: Record<string, number>;
  surveyOpenDate?: string | null;
}

interface CertCase {
  userId: string;
  fullName: string | null;
  email: string;
  pointA: number;
  pointB: number;
  ratio: number;
}

interface CertRespondent {
  userId: string;
  fullName: string | null;
  email: string;
  pointA: number | null;
  pointB: number | null;
  ratio: number | null;
  isCase: boolean;
  npsScore: number | null;
  submittedAt: string;
}

interface CertGroupResult extends GroupNPS {
  caseCount?: number;
  cases?: CertCase[];
  respondents?: CertRespondent[];
  satisfaction: {
    mentor: number | null;
    curator: number | null;
    clubEvents: number | null;
    psychologist: number | null;
    bot: number | null;
    results: number | null;
  };
}

interface NpsHistoryPoint {
  month: string;
  nps: number | null;
  total: number;
}

interface AvgScoreHistoryPoint {
  month: string;
  avgScore: number | null;
  total: number;
}

interface SurveyLesson {
  lessonId: string;
  lessonTitle: string;
  courseTitle?: string;
  totalResponses: number;
  groups: SurveyResult[];
  history?: NpsHistoryPoint[];
}

interface CertLesson {
  lessonId: string;
  lessonTitle: string;
  courseTitle?: string;
  totalResponses: number;
  groups: CertGroupResult[];
  history?: NpsHistoryPoint[];
}

interface FreeformGroupResult {
  groupId: string;
  groupName: string;
  responseCount: number;
  avgScore: number | null;
  nps: number | null;
  promoters: number;
  detractors: number;
  neutrals: number;
  total: number;
}

export interface FreeformLesson {
  lessonId: string;
  lessonTitle: string;
  courseTitle?: string;
  totalResponses: number;
  parsedResponses: number;
  groups: FreeformGroupResult[];
  history?: AvgScoreHistoryPoint[];
}

interface SurveyAnalyticsProps {
  freeformSurveys: FreeformLesson[];
  intermediateSurveys: SurveyLesson[];
  certificationForms: CertLesson[];
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const months = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function NpsHistory({ history }: { history: NpsHistoryPoint[] }) {
  if (history.length < 2) return null;
  const last5 = history.slice(-5);
  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Динамика NPS по месяцам</p>
      <div className="flex gap-2 flex-wrap">
        {last5.map((h, i) => {
          const prev = i > 0 ? last5[i - 1].nps : null;
          const trend = prev !== null && h.nps !== null
            ? h.nps > prev ? "↑" : h.nps < prev ? "↓" : "→"
            : "";
          const color = h.nps === null ? "text-muted-foreground"
            : h.nps >= 50 ? "text-green-600" : h.nps >= 0 ? "text-yellow-600" : "text-red-600";
          return (
            <div key={h.month} className="rounded border px-2.5 py-1.5 text-center min-w-[70px]">
              <div className="text-xs text-muted-foreground">{formatMonth(h.month)}</div>
              <div className={`text-sm font-bold ${color}`}>
                {h.nps !== null ? `${h.nps > 0 ? "+" : ""}${h.nps}%` : "—"}
                {trend && <span className="ml-0.5 text-xs">{trend}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{h.total} отв.</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvgScoreHistory({ history }: { history: AvgScoreHistoryPoint[] }) {
  if (history.length < 2) return null;
  const last5 = history.slice(-5);
  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Динамика средней оценки по месяцам</p>
      <div className="flex gap-2 flex-wrap">
        {last5.map((h, i) => {
          const prev = i > 0 ? last5[i - 1].avgScore : null;
          const trend = prev !== null && h.avgScore !== null
            ? h.avgScore > prev ? "↑" : h.avgScore < prev ? "↓" : "→"
            : "";
          const color = h.avgScore === null ? "text-muted-foreground"
            : h.avgScore >= 8 ? "text-green-600" : h.avgScore >= 6 ? "text-yellow-600" : "text-red-600";
          return (
            <div key={h.month} className="rounded border px-2.5 py-1.5 text-center min-w-[70px]">
              <div className="text-xs text-muted-foreground">{formatMonth(h.month)}</div>
              <div className={`text-sm font-bold ${color}`}>
                {h.avgScore !== null ? h.avgScore : "—"}
                {trend && <span className="ml-0.5 text-xs">{trend}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{h.total} отв.</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function npsColor(nps: number | null) {
  if (nps === null) return "text-muted-foreground";
  if (nps >= 50) return "text-green-600";
  if (nps >= 0) return "text-yellow-600";
  return "text-red-600";
}

function npsBadgeVariant(nps: number | null): "default" | "secondary" | "destructive" {
  if (nps === null) return "secondary";
  if (nps >= 0) return "default";
  return "destructive";
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  const color = value >= 8 ? "text-green-600" : value >= 6 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold ${color}`}>{value}</span>;
}

function LessonHeader({ title, courseTitle, totalResponses, parsedResponses, onDetail }: {
  title: string;
  courseTitle?: string;
  totalResponses: number;
  parsedResponses?: number;
  onDetail?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 flex-wrap">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {courseTitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{courseTitle}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0 items-center">
        <Badge variant="secondary">{totalResponses} ответов</Badge>
        {parsedResponses !== undefined && parsedResponses !== totalResponses && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            {parsedResponses} с оценкой
          </Badge>
        )}
        {onDetail && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onDetail}>
            <TableIcon className="h-3.5 w-3.5" />
            Детально
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

function DateRange({ start, end }: { start?: string | null; end?: string | null }) {
  if (!start && !end) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs whitespace-nowrap">
      {formatDate(start)} <span className="text-muted-foreground">→</span> {formatDate(end)}
    </span>
  );
}

function NPSTable({
  groups,
  showDates = false,
  showCases = false,
  showSurveyOpen = false,
  onRowClick,
}: {
  groups: (GroupNPS & { caseCount?: number; surveyOpenDate?: string | null })[];
  showDates?: boolean;
  showCases?: boolean;
  showSurveyOpen?: boolean;
  onRowClick?: (groupId: string) => void;
}) {
  const withResponses = groups.filter((g) => g.responseCount > 0);
  const withoutResponses = groups.filter((g) => g.responseCount === 0);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет данных</p>;
  }

  const extraCols = (showDates ? 1 : 0) + (showSurveyOpen ? 1 : 0) + (showCases ? 1 : 0);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Поток</TableHead>
            {showDates && <TableHead className="text-center">Старт → окончание</TableHead>}
            {showSurveyOpen && <TableHead className="text-center">Опрос открыт</TableHead>}
            <TableHead className="text-center">Ответов</TableHead>
            <TableHead className="text-center">За (9-10)</TableHead>
            <TableHead className="text-center">Нейтр (7-8)</TableHead>
            <TableHead className="text-center">Против (0-6)</TableHead>
            {showCases && <TableHead className="text-center">Кейсов</TableHead>}
            <TableHead className="text-center">NPS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withResponses.map((g) => (
            <TableRow
              key={g.groupId}
              className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
              onClick={onRowClick ? () => onRowClick(g.groupId) : undefined}
            >
              <TableCell className="font-medium">{g.groupName}</TableCell>
              {showDates && (
                <TableCell className="text-center">
                  <DateRange start={g.startDate} end={g.endDate} />
                </TableCell>
              )}
              {showSurveyOpen && (
                <TableCell className="text-center text-xs whitespace-nowrap">
                  {formatDate(g.surveyOpenDate)}
                </TableCell>
              )}
              <TableCell className="text-center">{g.responseCount}</TableCell>
              <TableCell className="text-center text-green-600 font-medium">{g.promoters}</TableCell>
              <TableCell className="text-center text-yellow-600 font-medium">{g.neutrals}</TableCell>
              <TableCell className="text-center text-red-600 font-medium">{g.detractors}</TableCell>
              {showCases && (
                <TableCell className="text-center">
                  <span
                    className={`font-semibold ${
                      (g.caseCount ?? 0) > 0 ? "text-blue-600" : "text-muted-foreground"
                    }`}
                  >
                    {g.caseCount ?? 0}
                  </span>
                </TableCell>
              )}
              <TableCell className="text-center">
                <Badge variant={npsBadgeVariant(g.nps)} className={npsColor(g.nps)}>
                  {g.nps !== null ? `${g.nps > 0 ? "+" : ""}${g.nps}%` : "—"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {withoutResponses.length > 0 && (
            <TableRow>
              <TableCell colSpan={6 + extraCols} className="text-xs text-muted-foreground py-2 border-t border-dashed">
                Не ответили ({withoutResponses.length}):{" "}
                {withoutResponses.map((g) => g.groupName).join(" · ")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function IntermediateSurveyCard({ lesson }: { lesson: SurveyLesson }) {
  const allQuestions = new Set<string>();
  lesson.groups.forEach((g) => Object.keys(g.avgScores ?? {}).forEach((q) => allQuestions.add(q)));
  const questionList = Array.from(allQuestions);
  const groupsWithData = lesson.groups.filter((g) => g.responseCount > 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsGroupId, setDetailsGroupId] = useState<string | null>(null);
  const detailsGroup =
    detailsGroupId != null ? lesson.groups.find((g) => g.groupId === detailsGroupId) ?? null : null;

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader
          title={lesson.lessonTitle}
          courseTitle={lesson.courseTitle}
          totalResponses={lesson.totalResponses}
          onDetail={() => setSheetOpen(true)}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <NPSTable
          groups={lesson.groups}
          showDates
          showSurveyOpen
          onRowClick={(id) => setDetailsGroupId(id)}
        />
        {lesson.history && lesson.history.length >= 2 && <NpsHistory history={lesson.history} />}

        {questionList.length > 0 && groupsWithData.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2 text-muted-foreground">Средние оценки по вопросам:</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Вопрос</TableHead>
                    {groupsWithData.map((g) => (
                      <TableHead key={g.groupId} className="text-center min-w-[120px]">
                        {g.groupName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionList.map((q) => (
                    <TableRow key={q}>
                      <TableCell className="text-sm max-w-[300px] break-words">{q}</TableCell>
                      {groupsWithData.map((g) => (
                        <TableCell key={g.groupId} className="text-center">
                          <ScoreCell value={g.avgScores?.[q] ?? null} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{lesson.lessonTitle}</SheetTitle>
        </SheetHeader>
        <SurveyResponsesTable lessonId={lesson.lessonId} />
      </SheetContent>
    </Sheet>

    <Sheet open={detailsGroupId !== null} onOpenChange={(o) => !o && setDetailsGroupId(null)}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {detailsGroup && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{detailsGroup.groupName}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {lesson.lessonTitle}
                {lesson.courseTitle ? ` · ${lesson.courseTitle}` : ""}
              </p>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Старт группы</div>
                <div className="text-sm font-medium">{formatDate(detailsGroup.startDate)}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Окончание</div>
                <div className="text-sm font-medium">{formatDate(detailsGroup.endDate)}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Опрос открыт</div>
                <div className="text-sm font-medium">
                  {formatDate(detailsGroup.surveyOpenDate)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Ответов</div>
                <div className="text-lg font-bold">{detailsGroup.responseCount}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">За (9-10)</div>
                <div className="text-lg font-bold text-green-600">
                  {detailsGroup.promoters}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Нейтр (7-8)</div>
                <div className="text-lg font-bold text-yellow-600">
                  {detailsGroup.neutrals}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Против (0-6)</div>
                <div className="text-lg font-bold text-red-600">
                  {detailsGroup.detractors}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">NPS</div>
                <div className={`text-lg font-bold ${npsColor(detailsGroup.nps)}`}>
                  {detailsGroup.nps !== null
                    ? `${detailsGroup.nps > 0 ? "+" : ""}${detailsGroup.nps}%`
                    : "—"}
                </div>
              </div>
            </div>

            {detailsGroup.avgScores && Object.keys(detailsGroup.avgScores).length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2 text-muted-foreground">
                  Средние оценки по вопросам
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Вопрос</TableHead>
                      <TableHead className="text-center w-24">Средняя</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(detailsGroup.avgScores).map(([q, v]) => (
                      <TableRow key={q}>
                        <TableCell className="text-sm max-w-[500px] break-words">
                          {q}
                        </TableCell>
                        <TableCell className="text-center">
                          <ScoreCell value={v} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

// Экранирование поля для CSV: оборачиваем в кавычки и удваиваем внутренние кавычки.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Скачивает CSV: строит blob, ставит BOM для Excel-совместимости и триггерит клик.
function downloadCsv(rows: (string | number | null | undefined)[][], filename: string) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportCasesCsv(groupName: string, lessonTitle: string, cases: CertCase[]) {
  const rows: (string | number | null)[][] = [
    ["ФИО", "Email", "Точка А (руб.)", "Точка Б (руб.)", "Коэффициент роста"],
    ...cases.map((c) => [c.fullName ?? "", c.email, c.pointA, c.pointB, c.ratio]),
  ];
  const safe = `${lessonTitle}_${groupName}_кейсы`.replace(/[/\\?%*:|"<>]/g, "_");
  downloadCsv(rows, `${safe}.csv`);
}

function exportRespondentsCsv(
  groupName: string,
  lessonTitle: string,
  respondents: CertRespondent[]
) {
  const rows: (string | number | null)[][] = [
    [
      "ФИО",
      "Email",
      "Дата отправки",
      "Точка А (руб.)",
      "Точка Б (руб.)",
      "Коэффициент роста",
      "Кейс",
      "NPS-оценка",
    ],
    ...respondents.map((r) => [
      r.fullName ?? "",
      r.email,
      new Date(r.submittedAt).toLocaleString("ru-RU"),
      r.pointA,
      r.pointB,
      r.ratio,
      r.isCase ? "Да" : "",
      r.npsScore,
    ]),
  ];
  const safe = `${lessonTitle}_${groupName}_все_ответы`.replace(/[/\\?%*:|"<>]/g, "_");
  downloadCsv(rows, `${safe}.csv`);
}

function CertificationCard({ lesson }: { lesson: CertLesson }) {
  const satisfactionLabels: Array<{ key: keyof CertGroupResult["satisfaction"]; label: string }> = [
    { key: "mentor", label: "Наставник" },
    { key: "curator", label: "Куратор" },
    { key: "clubEvents", label: "Мероприятия клуба" },
    { key: "psychologist", label: "Психолог" },
    { key: "bot", label: "Бот с заявками" },
    { key: "results", label: "Результаты обучения" },
  ];

  const groupsWithData = lesson.groups.filter((g) => g.responseCount > 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsGroupId, setDetailsGroupId] = useState<string | null>(null);
  const detailsGroup =
    detailsGroupId != null ? lesson.groups.find((g) => g.groupId === detailsGroupId) ?? null : null;

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader
          title={lesson.lessonTitle}
          courseTitle={lesson.courseTitle}
          totalResponses={lesson.totalResponses}
          onDetail={() => setSheetOpen(true)}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">NPS сертификации:</p>
          <NPSTable
            groups={lesson.groups}
            showDates
            showCases
            onRowClick={(id) => setDetailsGroupId(id)}
          />
          {lesson.history && lesson.history.length >= 2 && <NpsHistory history={lesson.history} />}
        </div>

        {groupsWithData.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 text-muted-foreground">Удовлетворённость (средняя оценка):</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Критерий</TableHead>
                    {groupsWithData.map((g) => (
                      <TableHead key={g.groupId} className="text-center min-w-[120px]">
                        {g.groupName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {satisfactionLabels.map(({ key, label }) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium text-sm">{label}</TableCell>
                      {groupsWithData.map((g) => (
                        <TableCell key={g.groupId} className="text-center">
                          <ScoreCell value={g.satisfaction[key]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{lesson.lessonTitle}</SheetTitle>
        </SheetHeader>
        <SurveyResponsesTable lessonId={lesson.lessonId} />
      </SheetContent>
    </Sheet>

    <Sheet open={detailsGroupId !== null} onOpenChange={(o) => !o && setDetailsGroupId(null)}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {detailsGroup && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{detailsGroup.groupName}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {lesson.lessonTitle}
                {lesson.courseTitle ? ` · ${lesson.courseTitle}` : ""}
              </p>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Старт группы</div>
                <div className="text-sm font-medium">{formatDate(detailsGroup.startDate)}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Окончание</div>
                <div className="text-sm font-medium">{formatDate(detailsGroup.endDate)}</div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Ответов</div>
                <div className="text-lg font-bold">{detailsGroup.responseCount}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">За (9-10)</div>
                <div className="text-lg font-bold text-green-600">
                  {detailsGroup.promoters}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Против (0-6)</div>
                <div className="text-lg font-bold text-red-600">
                  {detailsGroup.detractors}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">NPS</div>
                <div className={`text-lg font-bold ${npsColor(detailsGroup.nps)}`}>
                  {detailsGroup.nps !== null
                    ? `${detailsGroup.nps > 0 ? "+" : ""}${detailsGroup.nps}%`
                    : "—"}
                </div>
              </div>
              <div className="rounded border p-3 bg-blue-50 border-blue-200">
                <div className="text-xs text-blue-700">Кейсов</div>
                <div className="text-lg font-bold text-blue-700">
                  {detailsGroup.caseCount ?? 0}
                </div>
              </div>
            </div>

            {detailsGroup.cases && detailsGroup.cases.length > 0 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Кейсы (Точка Б / Точка А ≥ 1.5)
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() =>
                      exportCasesCsv(
                        detailsGroup.groupName,
                        lesson.lessonTitle,
                        detailsGroup.cases!
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать CSV
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Студент</TableHead>
                      <TableHead className="text-right">Точка А</TableHead>
                      <TableHead className="text-right">Точка Б</TableHead>
                      <TableHead className="text-center w-24">Рост</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsGroup.cases.map((c) => (
                      <TableRow key={c.userId}>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {c.fullName || c.email}
                          </div>
                          {c.fullName && (
                            <div className="text-xs text-muted-foreground">{c.email}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatRub(c.pointA)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatRub(c.pointB)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-blue-600">
                            ×{c.ratio.toFixed(2)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                В этой группе пока нет кейсов (студентов с ростом дохода ≥ 1.5×).
              </p>
            )}

            {detailsGroup.respondents && detailsGroup.respondents.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Все ответившие ({detailsGroup.respondents.length})
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() =>
                      exportRespondentsCsv(
                        detailsGroup.groupName,
                        lesson.lessonTitle,
                        detailsGroup.respondents!
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать CSV
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Студент</TableHead>
                      <TableHead className="text-center w-24">Дата</TableHead>
                      <TableHead className="text-right">Точка А</TableHead>
                      <TableHead className="text-right">Точка Б</TableHead>
                      <TableHead className="text-center w-20">Рост</TableHead>
                      <TableHead className="text-center w-16">NPS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsGroup.respondents.map((r) => {
                      const rowCls = r.isCase ? "bg-blue-50/50" : "";
                      return (
                        <TableRow key={r.userId} className={rowCls}>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {r.fullName || r.email}
                            </div>
                            {r.fullName && (
                              <div className="text-xs text-muted-foreground">
                                {r.email}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs whitespace-nowrap">
                            {formatDate(r.submittedAt)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {r.pointA !== null ? formatRub(r.pointA) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {r.pointB !== null ? formatRub(r.pointB) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.ratio !== null ? (
                              <Badge
                                variant={r.isCase ? "default" : "outline"}
                                className={r.isCase ? "bg-blue-600" : "text-muted-foreground"}
                              >
                                ×{r.ratio.toFixed(2)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.npsScore !== null ? (
                              <ScoreCell value={r.npsScore} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

function FreeformSurveyCard({ lesson }: { lesson: FreeformLesson }) {
  const withResponses = lesson.groups.filter((g) => g.responseCount > 0);
  const withoutResponses = lesson.groups.filter((g) => g.responseCount === 0);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader
          title={lesson.lessonTitle}
          courseTitle={lesson.courseTitle}
          totalResponses={lesson.totalResponses}
          parsedResponses={lesson.parsedResponses}
          onDetail={() => setSheetOpen(true)}
        />
      </CardHeader>
      <CardContent>
        {lesson.history && lesson.history.length >= 2 && (
          <AvgScoreHistory history={lesson.history as AvgScoreHistoryPoint[]} />
        )}
        {withResponses.length === 0 ? (
          <div className="py-2 space-y-1">
            <p className="text-sm text-muted-foreground">Нет ответов с числовой оценкой</p>
            {withoutResponses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Не ответили ({withoutResponses.length}):{" "}
                {withoutResponses.map((g) => g.groupName).join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Поток</TableHead>
                <TableHead className="text-center">Ответов</TableHead>
                <TableHead className="text-center">Ср. оценка</TableHead>
                <TableHead className="text-center">За (9-10)</TableHead>
                <TableHead className="text-center">Нейтр (7-8)</TableHead>
                <TableHead className="text-center">Против (0-6)</TableHead>
                <TableHead className="text-center">NPS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withResponses.map((g) => (
                <TableRow key={g.groupId}>
                  <TableCell className="font-medium">{g.groupName}</TableCell>
                  <TableCell className="text-center">{g.responseCount}</TableCell>
                  <TableCell className="text-center"><ScoreCell value={g.avgScore} /></TableCell>
                  <TableCell className="text-center text-green-600 font-medium">{g.promoters}</TableCell>
                  <TableCell className="text-center text-yellow-600 font-medium">{g.neutrals}</TableCell>
                  <TableCell className="text-center text-red-600 font-medium">{g.detractors}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={npsBadgeVariant(g.nps)} className={npsColor(g.nps)}>
                      {g.nps !== null ? `${g.nps > 0 ? "+" : ""}${g.nps}%` : "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {withoutResponses.length > 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-xs text-muted-foreground py-2 border-t border-dashed">
                    Не ответили ({withoutResponses.length}):{" "}
                    {withoutResponses.map((g) => g.groupName).join(" · ")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{lesson.lessonTitle}</SheetTitle>
        </SheetHeader>
        <SurveyResponsesTable lessonId={lesson.lessonId} />
      </SheetContent>
    </Sheet>
    </>
  );
}

const NPS_HINT = (
  <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
    <strong>NPS</strong> = (За − Против) / Всего × 100.{" "}
    <span className="text-green-600 font-medium">За</span> = оценки 9–10,{" "}
    <span className="text-yellow-600 font-medium">Нейтральные</span> = 7–8,{" "}
    <span className="text-red-600 font-medium">Против</span> = 0–6.
  </div>
);

export function SurveyAnalytics({ freeformSurveys, intermediateSurveys, certificationForms }: SurveyAnalyticsProps) {
  const hasFreeform = freeformSurveys.length > 0;
  const hasSurveys = intermediateSurveys.length > 0;
  const hasCerts = certificationForms.length > 0;

  if (!hasFreeform && !hasSurveys && !hasCerts) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground py-8">Опросы и анкеты сертификации ещё не заполнялись</p>
        </CardContent>
      </Card>
    );
  }

  const defaultTab = hasFreeform ? "freeform" : hasSurveys ? "surveys" : "certification";

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        {hasFreeform && (
          <TabsTrigger value="freeform" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            Оценки встреч
          </TabsTrigger>
        )}
        {hasSurveys && (
          <TabsTrigger value="surveys" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Промежуточные опросы
          </TabsTrigger>
        )}
        {hasCerts && (
          <TabsTrigger value="certification" className="flex items-center gap-1">
            <Award className="h-4 w-4" />
            Сертификация
          </TabsTrigger>
        )}
      </TabsList>

      {hasFreeform && (
        <TabsContent value="freeform" className="space-y-4">
          {NPS_HINT}
          {freeformSurveys.map((lesson) => (
            <FreeformSurveyCard key={lesson.lessonId} lesson={lesson} />
          ))}
        </TabsContent>
      )}

      {hasSurveys && (
        <TabsContent value="surveys" className="space-y-4">
          {NPS_HINT}
          {intermediateSurveys.map((lesson) => (
            <IntermediateSurveyCard key={lesson.lessonId} lesson={lesson} />
          ))}
        </TabsContent>
      )}

      {hasCerts && (
        <TabsContent value="certification" className="space-y-4">
          {NPS_HINT}
          {certificationForms.map((lesson) => (
            <CertificationCard key={lesson.lessonId} lesson={lesson} />
          ))}
        </TabsContent>
      )}
    </Tabs>
  );
}
