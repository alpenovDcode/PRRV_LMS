"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleAlert, ExternalLink, Users } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

type RiskLevel = "green" | "yellow" | "red";
interface DashboardData {
  groups: Array<{
    id: string;
    name: string;
    course: { title: string } | null;
    _count: { members: number };
  }>;
  selectedGroup: { id: string; name: string; courseTitle: string | null } | null;
  summary: { green: number; yellow: number; red: number; triggers: Record<string, number> };
  pendingIntegrations: string[];
  students: Array<{
    id: string;
    fullName: string | null;
    email: string;
    telegram: string | null;
    lastActiveAt: string | null;
    progressPercent: number;
    currentStage: string;
    level: RiskLevel;
    score: number;
    nextAction: string;
    signals: Array<{ code: string; label: string; points: number }>;
  }>;
}

const levelLabels: Record<RiskLevel, string> = {
  green: "Зелёный",
  yellow: "Жёлтый",
  red: "Красный",
};
const levelClasses: Record<RiskLevel, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

export default function CuratorAnalyticsPage() {
  const [groupId, setGroupId] = useState("");
  const [level, setLevel] = useState<"all" | RiskLevel>("all");
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["curator", "analytics", groupId],
    queryFn: async () => {
      const suffix = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
      const response = await apiClient.get(`/curator/analytics/overview${suffix}`);
      return response.data.data;
    },
  });
  const students = useMemo(
    () => data?.students.filter((student) => level === "all" || student.level === level) ?? [],
    [data?.students, level]
  );
  const total = data ? data.summary.green + data.summary.yellow + data.summary.red : 0;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Аналитика моей группы</h1>
          <p className="text-muted-foreground">
            Приоритеты и следующие действия по каждому студенту.
          </p>
        </div>
        <Select value={groupId || data?.selectedGroup?.id || "none"} onValueChange={setGroupId}>
          <SelectTrigger className="w-full md:w-72">
            <SelectValue placeholder="Выберите группу" />
          </SelectTrigger>
          <SelectContent>
            {data?.groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name} · {group._count.members}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && !data?.selectedGroup ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">За вами пока не закреплены группы</p>
            <p className="text-sm text-muted-foreground">
              Администратор может назначить группу в её настройках.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Всего студентов"
              value={total}
              icon={<Users className="h-5 w-5" />}
            />
            <SummaryCard
              title="В норме"
              value={data?.summary.green ?? 0}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            />
            <SummaryCard
              title="Нужны внимание"
              value={data?.summary.yellow ?? 0}
              icon={<CircleAlert className="h-5 w-5 text-amber-600" />}
            />
            <SummaryCard
              title="Высокий риск"
              value={data?.summary.red ?? 0}
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Студенты</CardTitle>
              <Select value={level} onValueChange={(value) => setLevel(value as typeof level)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все сегменты</SelectItem>
                  <SelectItem value="red">Красные</SelectItem>
                  <SelectItem value="yellow">Жёлтые</SelectItem>
                  <SelectItem value="green">Зелёные</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Студент</TableHead>
                    <TableHead>Сегмент</TableHead>
                    <TableHead>Прогресс</TableHead>
                    <TableHead>Текущий этап</TableHead>
                    <TableHead>Триггеры</TableHead>
                    <TableHead>Next best action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium">{student.fullName || "Без имени"}</div>
                        <div className="text-xs text-muted-foreground">{student.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={levelClasses[student.level]}>
                          {levelLabels[student.level]} · {student.score}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <div className="mb-1 text-xs">{student.progressPercent}%</div>
                        <Progress value={student.progressPercent} />
                      </TableCell>
                      <TableCell>{student.currentStage}</TableCell>
                      <TableCell className="max-w-56">
                        {student.signals.length ? (
                          <div className="flex flex-wrap gap-1">
                            {student.signals.map((signal) => (
                              <Badge
                                key={signal.code}
                                variant="secondary"
                                className="whitespace-normal"
                              >
                                {signal.label}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Нет</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-60">
                        <div className="text-sm">{student.nextAction}</div>
                        {student.telegram ? (
                          <Button asChild variant="link" size="sm" className="h-auto px-0">
                            <a
                              href={`https://t.me/${student.telegram.replace(/^@/, "")}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Написать в Telegram <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          </Button>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Telegram не указан
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!students.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  В этом сегменте студентов нет.
                </p>
              )}
            </CardContent>
          </Card>
          {data?.pendingIntegrations?.length ? (
            <p className="text-xs text-muted-foreground">
              Ожидают подключения источника данных: {data.pendingIntegrations.join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
