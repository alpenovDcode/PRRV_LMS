"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Scroll, CheckCircle, XCircle, Mail, Database, Bot, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details: any;
  createdAt: string;
  user?: {
    fullName: string;
    email: string;
  };
}

const actionIcons: Record<string, React.ReactNode> = {
  "BITRIX_DEAL": <Database className="w-4 h-4 text-blue-500" />,
  "EMAIL_SENT": <Mail className="w-4 h-4 text-purple-500" />,
  "EMAIL_ERROR": <XCircle className="w-4 h-4 text-red-500" />,
  "AI_GRADING": <Bot className="w-4 h-4 text-cyan-500" />,
  "USER_REGISTERED": <UserPlus className="w-4 h-4 text-green-500" />,
  "LANDING_SUBMISSION": <Scroll className="w-4 h-4 text-yellow-500" />,
  "SUBMISSION_ERROR": <XCircle className="w-4 h-4 text-red-500" />,
};

const actionLabels: Record<string, string> = {
  "BITRIX_DEAL": "Bitrix сделка",
  "EMAIL_SENT": "Email отправлен",
  "EMAIL_ERROR": "Ошибка Email",
  "AI_GRADING": "AI Проверка",
  "USER_REGISTERED": "Новый юзер",
  "LANDING_SUBMISSION": "Заявка с лендинга",
  "SUBMISSION_ERROR": "Ошибка обработки",
  "COURSE_ENROLLMENT": "Запись на курс"
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  async function fetchLogs() {
    try {
      const response = await apiClient.get("/admin/audit-logs"); // Ensure this endpoint supports params if needed
      if (response.data.success) {
        setLogs(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch logs", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мониторинг событий</h1>
        <p className="text-muted-foreground">
           Лог бизнес-процессов: заявки, письма, интеграции.
        </p>
      </div>

      <div className="flex gap-4 border-b pb-4">
          <Link href="/admin/monitoring/errors">
             <Button variant="ghost">Ошибки системы</Button>
          </Link>
          <Button variant="secondary">Бизнес-логи</Button>
          <Link href="/admin/monitoring/schedule">
             <Button variant="ghost">Расписание</Button>
          </Link>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Событие</TableHead>
              <TableHead>Пользователь</TableHead>
              <TableHead>Детали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">Загрузка...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={4} className="text-center text-muted-foreground">Нет записей</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ru })} <br/>
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {actionIcons[log.action] || <CheckCircle className="w-4 h-4 text-gray-400" />}
                      <span className={cn(
                          log.action === "SUBMISSION_ERROR" ? "text-red-600" : ""
                      )}>
                         {actionLabels[log.action] || log.action}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{log.user?.fullName || "Система"}</div>
                      <div className="text-xs text-muted-foreground">{log.user?.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                     <pre className="text-xs bg-gray-50 p-2 rounded max-w-md overflow-auto border">
                        {JSON.stringify(log.details, null, 2)}
                     </pre>
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
