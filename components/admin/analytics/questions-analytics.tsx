"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  MessageCircle,
  CheckCircle2,
  Clock,
  Star,
  Bell,
  Bot,
  TrendingUp,
  Download,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FirstResponder {
  botOnly: number;
  mentorOnly: number;
  botThenMentor: number;
  mentorThenBot: number;
  noResponse: number;
}

interface CuratorRow {
  curatorId: string;
  name: string;
  taken: number;
  closed: number;
  avgFirstResponseSec: number | null;
  avgRating: number | null;
}

interface StudentRow {
  studentId: string;
  name: string;
  email: string;
  questionCount: number;
  openCount: number;
  avgRating: number | null;
  mentorCalls: number;
  lastQuestionAt: string;
}

interface QuestionsData {
  totalQuestions: number;
  lastWeekCount: number;
  open: number;
  closed: number;
  mentorCallsTotal: number;
  avgFirstTouchSec: number | null;
  avgFirstResponseSec: number | null;
  avgRating: number | null;
  firstResponder: FirstResponder;
  ratingDistribution: { rating: number; count: number }[];
  perCurator: CuratorRow[];
  perStudent: StudentRow[];
  perWeek: { weekStart: string; count: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSec(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} ч`;
  return `${(sec / 86400).toFixed(1)} дн`;
}

function ratingColor(r: number | null): string {
  if (r == null) return "text-muted-foreground";
  if (r >= 8) return "text-green-600";
  if (r >= 6) return "text-yellow-600";
  return "text-red-600";
}

function barColor(r: number): string {
  if (r >= 9) return "#22c55e";
  if (r >= 7) return "#eab308";
  return "#ef4444";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
  valueColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${valueColor ?? ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-full bg-muted p-2 shrink-0 ml-2">
            <Icon className={`h-4 w-4 ${iconColor ?? "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FirstResponderSection({ data }: { data: FirstResponder }) {
  const bars = [
    { label: "Только бот", value: data.botOnly, color: "#6366f1" },
    { label: "Бот → Наставник", value: data.botThenMentor, color: "#8b5cf6" },
    { label: "Только наставник", value: data.mentorOnly, color: "#0ea5e9" },
    { label: "Наставник → Бот", value: data.mentorThenBot, color: "#38bdf8" },
    { label: "Нет ответа", value: data.noResponse, color: "#cbd5e1" },
  ].filter((b) => b.value > 0);

  const total = bars.reduce((s, b) => s + b.value, 0);
  const botFirst = data.botOnly + data.botThenMentor;
  const mentorFirst = data.mentorOnly + data.mentorThenBot;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bar breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Кто ответил первым</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bars.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Нет данных</p>
          ) : (
            bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-36 shrink-0">{b.label}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(b.value / total) * 100}%`, backgroundColor: b.color }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right shrink-0">{b.value}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Бот vs Наставник</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Бот ответил первым",
                value: botFirst,
                icon: Bot,
                color: "text-indigo-600",
                bg: "bg-indigo-50",
              },
              {
                label: "Наставник ответил первым",
                value: mentorFirst,
                icon: MessageCircle,
                color: "text-sky-600",
                bg: "bg-sky-50",
              },
              {
                label: "Бот без подключения наставника",
                value: data.botOnly,
                icon: Bot,
                color: "text-violet-600",
                bg: "bg-violet-50",
              },
              {
                label: "Без ответа",
                value: data.noResponse,
                icon: Clock,
                color: data.noResponse > 0 ? "text-red-600" : "text-muted-foreground",
                bg: data.noResponse > 0 ? "bg-red-50" : "bg-muted",
              },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-lg p-3 ${bg} flex items-center gap-2`}>
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CuratorTable({ rows }: { rows: CuratorRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">По наставникам</CardTitle>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Наставник</TableHead>
                <TableHead className="text-center">Взято</TableHead>
                <TableHead className="text-center">Закрыто</TableHead>
                <TableHead className="text-center">Ср. время до ответа</TableHead>
                <TableHead className="text-center">Ср. оценка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Нет данных
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow key={c.curatorId}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">{c.taken}</TableCell>
                    <TableCell className="text-center">
                      {c.closed}
                      {c.taken > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((c.closed / c.taken) * 100)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">{fmtSec(c.avgFirstResponseSec)}</TableCell>
                    <TableCell className="text-center">
                      {c.avgRating != null ? (
                        <span className={`font-semibold ${ratingColor(c.avgRating)}`}>
                          {c.avgRating}/10
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentTable({ rows }: { rows: StudentRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">По студентам</CardTitle>
          <Badge variant="secondary">{rows.length} студентов</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Студент</TableHead>
                <TableHead className="text-center">Вопросов</TableHead>
                <TableHead className="text-center">Открытых</TableHead>
                <TableHead className="text-center">Ср. оценка</TableHead>
                <TableHead className="text-center">Вызовов наставника</TableHead>
                <TableHead>Последний вопрос</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Нет данных
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.studentId}>
                    <TableCell>
                      <div className="font-medium text-sm leading-tight">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{r.questionCount}</TableCell>
                    <TableCell className="text-center">
                      {r.openCount > 0 ? (
                        <span className="text-yellow-600 font-medium">{r.openCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.avgRating != null ? (
                        <span className={`font-semibold ${ratingColor(r.avgRating)}`}>
                          {r.avgRating}/10
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.mentorCalls > 0 ? (
                        <span className="text-violet-600 font-medium">{r.mentorCalls}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.lastQuestionAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QuestionsAnalytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [curatorId, setCuratorId] = useState("all");
  const [groupId, setGroupId] = useState("all");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    if (curatorId !== "all") p.set("curatorId", curatorId);
    if (groupId !== "all") p.set("groupId", groupId);
    return p.toString();
  }, [from, to, curatorId, groupId]);

  const { data, isLoading } = useQuery<QuestionsData>({
    queryKey: ["admin", "analytics", "questions", queryParams],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/analytics/questions?${queryParams}`);
      return res.data.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-curators"],
    queryFn: async () => (await apiClient.get("/admin/users?role=curator&limit=200")).data.data,
  });
  const curators = (
    Array.isArray(usersData) ? usersData : usersData?.users ?? usersData?.items ?? []
  ) as any[];

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: async () => (await apiClient.get("/admin/groups")).data.data,
  });
  const groups = (
    Array.isArray(groupsData) ? groupsData : groupsData?.groups ?? groupsData?.items ?? []
  ) as any[];

  const handleExport = () => {
    window.open(`/api/admin/questions/export?${queryParams}`, "_blank");
  };

  const closedPercent =
    data && data.totalQuestions > 0
      ? Math.round((data.closed / data.totalQuestions) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Filters + Export */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">С даты</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 text-sm w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">По дату</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-sm w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Наставник</Label>
              <Select value={curatorId} onValueChange={setCuratorId}>
                <SelectTrigger className="h-8 text-sm w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  {curators.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Группа</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="h-8 text-sm w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  {groups.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 gap-1.5 ml-auto"
            >
              <Download className="h-3.5 w-3.5" />
              Скачать CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : !data ? null : (
        <>
          {/* KPI — Row 1: old metrics */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard
              icon={MessageCircle}
              label="Всего вопросов"
              value={data.totalQuestions}
              iconColor="text-blue-600"
            />
            <KpiCard
              icon={TrendingUp}
              label="За последнюю неделю"
              value={data.lastWeekCount}
              iconColor="text-emerald-600"
            />
            <KpiCard
              icon={Clock}
              label="Ср. время до ответа наставника"
              value={fmtSec(data.avgFirstResponseSec)}
              iconColor="text-amber-600"
            />
            <KpiCard
              icon={Star}
              label="Средняя оценка"
              value={data.avgRating != null ? `${data.avgRating}/10` : "—"}
              iconColor="text-purple-600"
              valueColor={ratingColor(data.avgRating)}
            />
          </div>

          {/* KPI — Row 2: new metrics */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard
              icon={Clock}
              label="Скорость 1-го касания"
              value={fmtSec(data.avgFirstTouchSec)}
              sub="бот или наставник"
              iconColor="text-indigo-600"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Завершено диалогов"
              value={data.closed}
              sub={`${closedPercent}% от всех`}
              iconColor="text-green-600"
              valueColor="text-green-600"
            />
            <KpiCard
              icon={Clock}
              label="Открытых диалогов"
              value={data.open}
              iconColor="text-yellow-600"
              valueColor={data.open > 0 ? "text-yellow-600" : ""}
            />
            <KpiCard
              icon={Bell}
              label="Вызовов наставника"
              value={data.mentorCallsTotal}
              sub={
                data.totalQuestions > 0
                  ? `${Math.round((data.mentorCallsTotal / data.totalQuestions) * 100)}% диалогов`
                  : undefined
              }
              iconColor="text-violet-600"
              valueColor={data.mentorCallsTotal > 0 ? "text-violet-600" : ""}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Динамика по неделям</CardTitle>
              </CardHeader>
              <CardContent>
                {data.perWeek.length < 2 ? (
                  <p className="text-sm text-muted-foreground py-4">Недостаточно данных</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={data.perWeek.slice(-12)}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v} вопросов`, ""]} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Распределение оценок (1–10)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.ratingDistribution.every((d) => d.count === 0) ? (
                  <p className="text-sm text-muted-foreground py-4">Оценок пока нет</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.ratingDistribution}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="rating" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v}`, "Диалогов"]} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {data.ratingDistribution.map((d) => (
                          <Cell key={d.rating} fill={barColor(d.rating)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* First responder */}
          <FirstResponderSection data={data.firstResponder} />

          {/* Per-curator table */}
          <CuratorTable rows={data.perCurator} />

          {/* Per-student table */}
          <StudentTable rows={data.perStudent} />
        </>
      )}
    </div>
  );
}
