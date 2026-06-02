"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, MessageSquare, Award } from "lucide-react";

interface GroupNPS {
  groupId: string;
  groupName: string;
  responseCount: number;
  nps: number | null;
  promoters: number;
  detractors: number;
  neutrals: number;
  total: number;
}

interface SurveyResult extends GroupNPS {
  avgScores?: Record<string, number>;
}

interface CertGroupResult extends GroupNPS {
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

function LessonHeader({ title, courseTitle, totalResponses, parsedResponses }: {
  title: string;
  courseTitle?: string;
  totalResponses: number;
  parsedResponses?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-2 flex-wrap">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {courseTitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{courseTitle}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Badge variant="secondary">{totalResponses} ответов</Badge>
        {parsedResponses !== undefined && parsedResponses !== totalResponses && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            {parsedResponses} с оценкой
          </Badge>
        )}
      </div>
    </div>
  );
}

function NPSTable({ groups }: { groups: GroupNPS[] }) {
  const withResponses = groups.filter((g) => g.responseCount > 0);
  const withoutResponses = groups.filter((g) => g.responseCount === 0);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет данных</p>;
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Поток</TableHead>
            <TableHead className="text-center">Ответов</TableHead>
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
              <TableCell colSpan={6} className="text-xs text-muted-foreground py-2 border-t border-dashed">
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader title={lesson.lessonTitle} courseTitle={lesson.courseTitle} totalResponses={lesson.totalResponses} />
      </CardHeader>
      <CardContent className="space-y-4">
        <NPSTable groups={lesson.groups} />
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
  );
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader title={lesson.lessonTitle} courseTitle={lesson.courseTitle} totalResponses={lesson.totalResponses} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">NPS сертификации:</p>
          <NPSTable groups={lesson.groups} />
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
  );
}

function FreeformSurveyCard({ lesson }: { lesson: FreeformLesson }) {
  const withResponses = lesson.groups.filter((g) => g.responseCount > 0);
  const withoutResponses = lesson.groups.filter((g) => g.responseCount === 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <LessonHeader
          title={lesson.lessonTitle}
          courseTitle={lesson.courseTitle}
          totalResponses={lesson.totalResponses}
          parsedResponses={lesson.parsedResponses}
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
