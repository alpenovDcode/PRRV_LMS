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
import { CheckCircle, XCircle, Clock, CalendarCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";

interface ScheduleItem {
  moduleId: string;
  moduleTitle: string;
  courseTitle: string;
  groupId: string;
  groupName: string;
  expectedOpenDate: string | null;
  status: "opened" | "waiting" | "error_no_date";
}

export default function SchedulePage() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    setLoading(true);
    try {
      const response = await apiClient.get("/admin/monitoring/schedule");
      if (response.data.success) {
        setItems(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch schedule", error);
      alert("Ошибка: Не удалось загрузить расписание");
    } finally {
      setLoading(false);
    }
  }

  async function handleForceOpen(moduleId: string, groupId: string) {
    if (!confirm("Вы действительно хотите принудительно открыть этот модуль для всех студентов группы?")) {
        return;
    }
    setProcessingId(`${moduleId}-${groupId}`);
    try {
        const response = await apiClient.post("/admin/monitoring/schedule/force-open", {
             moduleId,
             groupId,
        });
        if (response.data.success) {
             alert(response.data.data.message || "Модуль успешно открыт");
             // We can optimally update the UI to "opened" to give immediate feedback
             setItems(prevItems => prevItems.map(item => 
                 (item.moduleId === moduleId && item.groupId === groupId) 
                 ? { ...item, status: "opened" } 
                 : item
             ));
        }
    } catch (error: any) {
         alert("Ошибка: " + (error.response?.data?.error?.message || "Не удалось открыть модуль"));
    } finally {
         setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Расписание и доступы</h1>
        <p className="text-muted-foreground">
           Контроль своевременного открытия модулей для учебных групп
        </p>
      </div>

      <div className="flex gap-4 border-b pb-4">
          <Link href="/admin/monitoring/errors">
             <Button variant="ghost">Ошибки системы</Button>
          </Link>
          <Link href="/admin/monitoring/audit">
             <Button variant="ghost">Бизнес-логи</Button>
          </Link>
          <Button variant="secondary">Расписание</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Курс / Модуль</TableHead>
              <TableHead>Группа</TableHead>
              <TableHead>Ожидаемая дата</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка расписания...</TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет запланированных модулей для групп</TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={`${item.moduleId}-${item.groupId}`}>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{item.moduleTitle}</div>
                      <div className="text-xs text-muted-foreground">{item.courseTitle}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.groupName}</Badge>
                  </TableCell>
                  <TableCell>
                      {item.expectedOpenDate ? (
                          <div className="text-sm flex flex-col">
                              <span>{format(new Date(item.expectedOpenDate), "d MMMM yyyy", { locale: ru })}</span>
                              <span className="text-xs text-muted-foreground">{format(new Date(item.expectedOpenDate), "HH:mm")}</span>
                          </div>
                      ) : (
                          <span className="text-xs text-red-500 font-medium line-clamp-1">Невозможно вычислить</span>
                      )}
                  </TableCell>
                  <TableCell>
                      {item.status === "opened" && (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                             <CheckCircle className="w-3 h-3 mr-1" /> Открыт
                          </Badge>
                      )}
                      {item.status === "waiting" && (
                          <Badge variant="secondary" className="text-amber-600 bg-amber-50">
                             <Clock className="w-3 h-3 mr-1" /> Ожидает
                          </Badge>
                      )}
                      {item.status === "error_no_date" && (
                          <Badge variant="destructive">
                             <AlertTriangle className="w-3 h-3 mr-1" /> Ошибка: нет старта группы
                          </Badge>
                      )}
                  </TableCell>
                  <TableCell className="text-right">
                     {(item.status === "waiting" || item.status === "error_no_date") && (
                         <Button
                            size="sm"
                            variant="default"
                            disabled={processingId === `${item.moduleId}-${item.groupId}`}
                            onClick={() => handleForceOpen(item.moduleId, item.groupId)}
                         >
                            {processingId === `${item.moduleId}-${item.groupId}` ? "Открываем..." : "Принудительно открыть"}
                         </Button>
                     )}
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
