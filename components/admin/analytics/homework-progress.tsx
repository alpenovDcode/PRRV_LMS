"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface HomeworkData {
  name: string;
  value: number;
  [key: string]: any;
}

interface HomeworkProgressTableProps {
  data: HomeworkData[];
  isLoading: boolean;
}

export function HomeworkProgressChart({ data, isLoading }: HomeworkProgressTableProps) {
  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Статус домашних заданий</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-muted/10 animate-pulse rounded-md">
            Загрузка...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Статус домашних заданий</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Нет данных для отображения</p>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Статус домашних заданий</CardTitle>
        <div className="text-sm mt-2">
          <span className="text-muted-foreground">Всего: </span>
          <span className="font-semibold">{total}</span>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Количество</TableHead>
              <TableHead className="text-right">Процент</TableHead>
              <TableHead className="text-right">Индикатор</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              
              let badgeVariant: "default" | "secondary" | "destructive" = "secondary";
              let badgeColor = "";
              
              if (item.name === "На проверке") {
                badgeVariant = "secondary";
                badgeColor = "bg-orange-500 hover:bg-orange-600";
              } else if (item.name === "Принято") {
                badgeVariant = "default";
                badgeColor = "bg-green-600 hover:bg-green-700";
              } else if (item.name === "Отклонено") {
                badgeVariant = "destructive";
              }

              return (
                <TableRow key={item.name}>
                  <TableCell className="font-medium">
                    {item.name}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {item.value}
                  </TableCell>
                  <TableCell className="text-right">
                    {percent}%
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={badgeVariant} className={badgeColor}>
                      {item.name}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Дополнительная статистика */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          {data.map((item) => {
            const percent = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
            return (
              <div key={`stat-${item.name}`} className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{percent}%</div>
                <div className="text-xs text-muted-foreground">{item.name}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
