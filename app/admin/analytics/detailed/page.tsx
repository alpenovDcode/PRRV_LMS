"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, Clock, XCircle, TrendingDown, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface AnalyticsData {
  riskStudents: {
    id: string;
    fullName: string | null;
    email: string;
    lastActivity: string;
    tariff: string | null;
  }[];
  homeworkStats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    avgReviewTimeMinutes: number;
  };
  funnel: {
    title: string;
    moduleTitle: string;
    completedCount: number;
  }[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function DetailedAnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["admin", "analytics", "detailed"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/analytics/detailed");
      return response.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  const homeworkData = [
    { name: 'Ожидают', value: data.homeworkStats.pending, color: '#f59e0b' },
    { name: 'Принято', value: data.homeworkStats.approved, color: '#22c55e' },
    { name: 'Отклонено', value: data.homeworkStats.rejected, color: '#ef4444' },
  ];

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
          Детальная аналитика
        </h1>
        <p className="text-gray-500 mt-2">
          Мониторинг активности студентов и эффективности обучения
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Студентов в зоне риска</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.riskStudents.length}</div>
            <p className="text-xs text-muted-foreground">Не заходили более 7 дней</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Среднее время проверки</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.homeworkStats.avgReviewTimeMinutes} мин</div>
            <p className="text-xs text-muted-foreground">Время реакции куратора</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего ДЗ</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.homeworkStats.total}</div>
            <p className="text-xs text-muted-foreground">
              {data.homeworkStats.pending} ожидают проверки
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        
        {/* Homework Stats Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Статус домашних заданий</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={homeworkData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {homeworkData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
             <div className="flex justify-center gap-4 text-sm">
                {homeworkData.map(d => (
                    <div key={d.name} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color}} />
                        <span>{d.name}: {d.value}</span>
                    </div>
                ))}
             </div>
          </CardContent>
        </Card>

        {/* Funnel Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Воронка прохождения (Топ 15 уроков)</CardTitle>
            <CardDescription>Количество завершивших урок студентов</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.funnel} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                        dataKey="title" 
                        type="category" 
                        width={150} 
                        tick={{fontSize: 10}}
                        interval={0}
                    />
                    <Tooltip />
                    <Bar dataKey="completedCount" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Risk Students Table */}
      <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                     <CardTitle className="text-red-600 flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" />
                        Зона риска
                    </CardTitle>
                    <CardDescription>Студенты, которые давно не проявляли активность</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Студент</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Тариф</TableHead>
                <TableHead>Последняя активность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.riskStudents.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                          Все студенты активны! 🚀
                      </TableCell>
                  </TableRow>
              ) : (
                  data.riskStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.fullName || "Без имени"}</TableCell>
                      <TableCell>{student.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{student.tariff || "Не указан"}</Badge>
                      </TableCell>
                      <TableCell className="text-red-600 font-medium">
                        {new Date(student.lastActivity).toLocaleDateString("ru-RU")}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
