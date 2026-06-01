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

interface SurveyLesson {
  lessonId: string;
  lessonTitle: string;
  totalResponses: number;
  groups: SurveyResult[];
}

interface CertLesson {
  lessonId: string;
  lessonTitle: string;
  totalResponses: number;
  groups: CertGroupResult[];
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

interface FreeformLesson {
  lessonId: string;
  lessonTitle: string;
  totalResponses: number;
  parsedResponses: number;
  groups: FreeformGroupResult[];
}

interface SurveyAnalyticsProps {
  freeformSurveys: FreeformLesson[];
  intermediateSurveys: SurveyLesson[];
  certificationForms: CertLesson[];
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
  const color =
    value >= 8 ? "text-green-600" : value >= 6 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold ${color}`}>{value}</span>;
}

function NPSTable({ groups }: { groups: GroupNPS[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет данных по потокам</p>;
  }
  return (
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
        {groups.map((g) => (
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
      </TableBody>
    </Table>
  );
}

function IntermediateSurveyCard({ lesson }: { lesson: SurveyLesson }) {
  // Collect all unique scale question names
  const allQuestions = new Set<string>();
  lesson.groups.forEach((g) => {
    Object.keys(g.avgScores ?? {}).forEach((q) => allQuestions.add(q));
  });
  const questionList = Array.from(allQuestions);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{lesson.lessonTitle}</CardTitle>
          <Badge variant="secondary" className="shrink-0 ml-2">
            {lesson.totalResponses} ответов
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <NPSTable groups={lesson.groups} />

        {questionList.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Средние оценки по вопросам:
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Вопрос</TableHead>
                    {lesson.groups.map((g) => (
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
                      {lesson.groups.map((g) => (
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
  const satisfactionLabels: Array<{
    key: keyof CertGroupResult["satisfaction"];
    label: string;
  }> = [
    { key: "mentor", label: "Наставник" },
    { key: "curator", label: "Куратор" },
    { key: "clubEvents", label: "Мероприятия клуба" },
    { key: "psychologist", label: "Психолог" },
    { key: "bot", label: "Бот с заявками" },
    { key: "results", label: "Результаты обучения" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-blue-500" />
            {lesson.lessonTitle}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 ml-2">
            {lesson.totalResponses} ответов
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">NPS сертификации:</p>
          <NPSTable groups={lesson.groups} />
        </div>

        {lesson.groups.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Удовлетворённость (средняя оценка по потокам):
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Критерий</TableHead>
                    {lesson.groups.map((g) => (
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
                      {lesson.groups.map((g) => (
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{lesson.lessonTitle}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary">{lesson.totalResponses} сдано</Badge>
            {lesson.totalResponses !== lesson.parsedResponses && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                {lesson.parsedResponses} с оценкой
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {lesson.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Нет данных по потокам</p>
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
              {lesson.groups.map((g) => (
                <TableRow key={g.groupId}>
                  <TableCell className="font-medium">{g.groupName}</TableCell>
                  <TableCell className="text-center">{g.responseCount}</TableCell>
                  <TableCell className="text-center">
                    <ScoreCell value={g.avgScore} />
                  </TableCell>
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
    <span className="text-red-600 font-medium">Против</span> = 0–6.{" "}
    Цвет оценок:{" "}
    <span className="text-green-600 font-medium">≥8</span> — хорошо,{" "}
    <span className="text-yellow-600 font-medium">6–7</span> — средне,{" "}
    <span className="text-red-600 font-medium">≤5</span> — плохо.
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
          <p className="text-center text-muted-foreground py-8">
            Опросы и анкеты сертификации ещё не заполнялись
          </p>
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
