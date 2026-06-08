"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ResponseRow {
  userId: string;
  userName: string;
  userEmail: string;
  groupId: string;
  groupName: string;
  submittedAt: string;
  answers: Record<string, string>;
}

interface ResponsesData {
  lessonId: string;
  lessonTitle: string;
  questions: string[];
  groups: { id: string; name: string }[];
  responses: ResponseRow[];
}

function answerColor(val: string): string {
  const num = parseFloat(val);
  if (isNaN(num)) return "";
  if (num >= 9) return "text-green-600 font-semibold";
  if (num >= 7) return "text-yellow-600 font-semibold";
  if (num >= 0) return "text-red-600 font-semibold";
  return "";
}

function AnswerCell({ value }: { value: string | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  const num = parseFloat(value);
  if (!isNaN(num)) {
    return <span className={answerColor(value)}>{value}</span>;
  }
  if (value.length > 40) {
    return (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left text-xs hover:text-foreground transition-colors"
      >
        {expanded ? (
          <span>
            {value}
            <span className="ml-1 text-muted-foreground underline">скрыть</span>
          </span>
        ) : (
          <span>
            <span className="underline decoration-dotted">{value.slice(0, 38)}…</span>
            <span className="ml-1 text-muted-foreground">читать</span>
          </span>
        )}
      </button>
    );
  }
  return <span className="text-sm">{value}</span>;
}

function avgNum(values: string[]): number | null {
  const nums = values.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 8 ? "text-green-600" : value >= 6 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold ${color}`}>{value}</span>;
}

// Short question label for column header (trim whitespace, cap length)
function shortQ(q: string): string {
  const trimmed = q.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 48) + "…" : trimmed;
}

function ResponsesTabContent({
  questions,
  responses,
  groups,
}: {
  questions: string[];
  responses: ResponseRow[];
  groups: { id: string; name: string }[];
}) {
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const filtered = groupFilter === "all"
    ? responses
    : responses.filter((r) => r.groupId === groupFilter);

  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Поток:</span>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[220px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все потоки</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto">{filtered.length} ответов</Badge>
        </div>
      )}
      <div className="overflow-x-auto rounded border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="sticky left-0 bg-muted/30 z-10 min-w-[160px]">Пользователь</TableHead>
              {groups.length > 1 && <TableHead className="min-w-[120px]">Поток</TableHead>}
              <TableHead className="min-w-[100px]">Дата</TableHead>
              {questions.map((q) => (
                <TableHead key={q} className="text-center min-w-[80px] max-w-[160px]" title={q}>
                  <span className="text-xs leading-tight block">{shortQ(q)}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={questions.length + 3} className="text-center text-muted-foreground py-6">
                  Нет ответов
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, i) => (
                <TableRow key={`${row.userId}-${i}`}>
                  <TableCell className="sticky left-0 bg-background z-10">
                    <div className="font-medium text-sm leading-tight">{row.userName}</div>
                    <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                  </TableCell>
                  {groups.length > 1 && (
                    <TableCell className="text-sm text-muted-foreground">{row.groupName}</TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.submittedAt), "dd.MM.yyyy", { locale: ru })}
                  </TableCell>
                  {questions.map((q) => (
                    <TableCell key={q} className="text-center">
                      <AnswerCell value={row.answers[q]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AggregateTabContent({ questions, responses }: { questions: string[]; responses: ResponseRow[] }) {
  const rows = useMemo(() =>
    questions.map((q) => {
      const values = responses.map((r) => r.answers[q]).filter(Boolean) as string[];
      const nums = values.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
      const textValues = values.filter((v) => isNaN(parseFloat(v)));
      return { q, avg: avgNum(values), count: nums.length, textCount: textValues.length, total: values.length };
    }),
    [questions, responses]
  );

  return (
    <div className="overflow-x-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="min-w-[280px]">Вопрос</TableHead>
            <TableHead className="text-center">Ответов</TableHead>
            <TableHead className="text-center min-w-[100px]">Среднее</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ q, avg, count, textCount, total }) => (
            <TableRow key={q}>
              <TableCell className="text-sm">{q}</TableCell>
              <TableCell className="text-center text-sm">
                {total}
                {textCount > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">({textCount} текст.)</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {count > 0 ? <ScoreCell value={avg} /> : <span className="text-muted-foreground text-sm">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StreamsTabContent({
  questions,
  responses,
  groups,
}: {
  questions: string[];
  responses: ResponseRow[];
  groups: { id: string; name: string }[];
}) {
  const numericQuestions = useMemo(
    () => questions.filter((q) =>
      responses.some((r) => r.answers[q] !== undefined && !isNaN(parseFloat(r.answers[q])))
    ),
    [questions, responses]
  );

  const rows = useMemo(() => {
    const groupsWithResponses = groups.filter((g) => responses.some((r) => r.groupId === g.id));
    return groupsWithResponses.map((g) => {
      const groupResponses = responses.filter((r) => r.groupId === g.id);
      const avgs: Record<string, number | null> = {};
      for (const q of numericQuestions) {
        avgs[q] = avgNum(groupResponses.map((r) => r.answers[q]).filter(Boolean) as string[]);
      }
      return { group: g, count: groupResponses.length, avgs };
    });
  }, [groups, responses, numericQuestions]);

  if (numericQuestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Числовых ответов нет — сводка по потокам недоступна
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="min-w-[140px]">Поток</TableHead>
            <TableHead className="text-center">Ответов</TableHead>
            {numericQuestions.map((q) => (
              <TableHead key={q} className="text-center min-w-[80px] max-w-[160px]" title={q}>
                <span className="text-xs leading-tight block">{shortQ(q)}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ group, count, avgs }) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium text-sm">{group.name}</TableCell>
              <TableCell className="text-center text-sm">{count}</TableCell>
              {numericQuestions.map((q) => (
                <TableCell key={q} className="text-center">
                  <ScoreCell value={avgs[q]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SurveyResponsesTable({ lessonId }: { lessonId: string }) {
  const { data, isLoading, isError } = useQuery<ResponsesData>({
    queryKey: ["survey-responses", lessonId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/surveys/${lessonId}/responses`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Ошибка загрузки");
      return json.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive py-4 px-2">Не удалось загрузить ответы</p>
    );
  }

  const { questions, groups, responses } = data;

  if (responses.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Ответов пока нет</p>;
  }

  return (
    <Tabs defaultValue="responses" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <TabsList>
          <TabsTrigger value="responses">Ответы студентов</TabsTrigger>
          <TabsTrigger value="aggregate">Сводный отчёт</TabsTrigger>
          {groups.length > 1 && <TabsTrigger value="streams">По потокам</TabsTrigger>}
        </TabsList>
        <Badge variant="secondary">{responses.length} ответов · {questions.length} вопросов</Badge>
      </div>

      <TabsContent value="responses">
        <ResponsesTabContent questions={questions} responses={responses} groups={groups} />
      </TabsContent>

      <TabsContent value="aggregate">
        <AggregateTabContent questions={questions} responses={responses} />
      </TabsContent>

      {groups.length > 1 && (
        <TabsContent value="streams">
          <StreamsTabContent questions={questions} responses={responses} groups={groups} />
        </TabsContent>
      )}
    </Tabs>
  );
}
