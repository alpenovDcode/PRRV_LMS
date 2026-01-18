"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, Bug, Info, AlertCircle, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { apiClient } from "@/lib/api-client";

interface ErrorGroup {
  id: string;
  title: string;
  message: string;
  count: number;
  severity: "critical" | "error" | "warning" | "info";
  status: "new" | "investigating" | "resolved" | "ignored";
  lastOccurred: string;
  firstOccurred: string;
}

const severityIcons = {
  critical: <AlertCircle className="h-4 w-4" />,
  error: <AlertTriangle className="h-4 w-4" />,
  warning: <Bug className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const severityColors = {
  critical: "destructive",
  error: "destructive",
  warning: "warning",
  info: "secondary",
} as const;

const statusColors = {
  new: "destructive" as const,
  investigating: "secondary" as const,
  resolved: "default" as const,
  ignored: "outline" as const,
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchErrors();
  }, [severity, status]);

  async function fetchErrors() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        groupBy: "fingerprint",
        limit: "50",
      });

      if (severity !== "all") params.set("severity", severity);
      if (status !== "all") params.set("status", status);

      const response = await apiClient.get(`/admin/errors?${params}`);
      const data = response.data;

      if (data.success) {
        setErrors(data.groups || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Failed to fetch errors:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteError(id: string) {
    if (!confirm("Вы уверены, что хотите удалить эту ошибку?")) return;

    try {
      await apiClient.delete(`/admin/errors/${id}`);
      fetchErrors();
    } catch (error) {
      console.error("Failed to delete error:", error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мониторинг ошибок</h1>
        <p className="text-muted-foreground">
          Отслеживание и управление ошибками приложения
        </p>
      </div>

      {/* Фильтры */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-medium">Severity</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="mb-2 block text-sm font-medium">Статус</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="new">Новые</SelectItem>
                <SelectItem value="investigating">В работе</SelectItem>
                <SelectItem value="resolved">Исправлено</SelectItem>
                <SelectItem value="ignored">Игнорируется</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={fetchErrors} variant="outline">
              Обновить
            </Button>
          </div>
        </div>
      </Card>

      {/* Статистика */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">
            Всего ошибок
          </div>
          <div className="mt-2 text-2xl font-bold">{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">
            Новые
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {errors.filter((e) => e.status === "new").length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">
            В работе
          </div>
          <div className="mt-2 text-2xl font-bold text-yellow-600">
            {errors.filter((e) => e.status === "investigating").length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">
            Исправлено
          </div>
          <div className="mt-2 text-2xl font-bold text-green-600">
            {errors.filter((e) => e.status === "resolved").length}
          </div>
        </Card>
      </div>

      {/* Таблица ошибок */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Ошибка</TableHead>
              <TableHead>Количество</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Последнее</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Загрузка...
                </TableCell>
              </TableRow>
            ) : errors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Ошибок не найдено
                </TableCell>
              </TableRow>
            ) : (
              errors.map((error) => (
                <TableRow key={error.id}>
                  <TableCell>
                    <Badge variant={severityColors[error.severity]}>
                      <span className="flex items-center gap-1">
                        {severityIcons[error.severity]}
                        {error.severity}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-md">
                      <div className="font-medium">{error.title}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {error.message}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{error.count}x</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[error.status]}>
                      {error.status === "new" && "Новая"}
                      {error.status === "investigating" && "В работе"}
                      {error.status === "resolved" && "Исправлено"}
                      {error.status === "ignored" && "Игнорируется"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(error.lastOccurred), {
                        addSuffix: true,
                        locale: ru,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/monitoring/errors/${error.id}`}>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteError(error.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
