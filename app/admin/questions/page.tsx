"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, Clock, Star, MessageSquare, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

function fmtSeconds(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} сек`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} ч`;
  return `${(sec / 86400).toFixed(1)} дн`;
}

export default function AdminQuestionsStatsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [curatorId, setCuratorId] = useState<string>("all");
  const [groupId, setGroupId] = useState<string>("all");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    if (curatorId !== "all") p.set("curatorId", curatorId);
    if (groupId !== "all") p.set("groupId", groupId);
    return p.toString();
  }, [from, to, curatorId, groupId]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["question-stats", queryParams],
    queryFn: async () => (await apiClient.get(`/admin/questions/stats?${queryParams}`)).data.data,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-curators"],
    queryFn: async () => (await apiClient.get("/admin/users?role=curator&limit=200")).data.data,
  });
  const curators = (usersData?.users || usersData?.items || []) as any[];

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: async () => (await apiClient.get("/admin/groups")).data.data,
  });
  const groups = (groupsData?.groups || groupsData?.items || []) as any[];

  const handleExport = () => {
    window.open(`/api/admin/questions/export?${queryParams}`, "_blank");
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Статистика вопросов</h1>
            <p className="text-gray-600">Аналитика диалогов студент ↔ наставник</p>
          </div>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Скачать CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>С даты</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>По дату</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Наставник</Label>
            <Select value={curatorId} onValueChange={setCuratorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {curators.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.fullName || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Группа</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {groups.map((g: any) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard icon={<MessageSquare className="h-5 w-5 text-blue-600" />} label="Всего вопросов" value={stats?.totalQuestions ?? 0} />
            <KpiCard icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} label="За последнюю неделю" value={stats?.lastWeekCount ?? 0} />
            <KpiCard icon={<Clock className="h-5 w-5 text-amber-600" />} label="Среднее время до ответа" value={fmtSeconds(stats?.avgFirstResponseSec ?? null)} />
            <KpiCard icon={<Star className="h-5 w-5 text-purple-600" />} label="Средняя оценка" value={stats?.avgRating != null ? `${stats.avgRating}/10` : "—"} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Динамика по неделям</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={stats?.perWeek || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekStart" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Распределение оценок (1–10)</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={stats?.ratingDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rating" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#9333ea" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">По наставникам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-600 border-b">
                    <tr>
                      <th className="py-2 pr-4">Наставник</th>
                      <th className="py-2 pr-4">Взято</th>
                      <th className="py-2 pr-4">Закрыто</th>
                      <th className="py-2 pr-4">Среднее время до ответа</th>
                      <th className="py-2 pr-4">Средняя оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats?.perCurator || []).length === 0 ? (
                      <tr><td colSpan={5} className="py-4 text-gray-500">Нет данных</td></tr>
                    ) : (
                      (stats.perCurator || []).map((c: any) => (
                        <tr key={c.curatorId} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium">{c.name}</td>
                          <td className="py-2 pr-4">{c.taken}</td>
                          <td className="py-2 pr-4">{c.closed}</td>
                          <td className="py-2 pr-4">{fmtSeconds(c.avgFirstResponseSec)}</td>
                          <td className="py-2 pr-4">{c.avgRating != null ? `${c.avgRating}/10` : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">{icon}<span>{label}</span></div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
