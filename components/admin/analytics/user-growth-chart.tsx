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
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface UserGrowthData {
  date: string;
  count: number;
}

interface UserGrowthTableProps {
  data: UserGrowthData[];
  isLoading: boolean;
}

export function UserGrowthTable({ data, isLoading }: UserGrowthTableProps) {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Рост пользователей</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] flex items-center justify-center bg-muted/10 animate-pulse rounded-md">
            Загрузка данных...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Рост пользователей</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Нет данных для отображения</p>
        </CardContent>
      </Card>
    );
  }

  // Вычисляем статистику
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const average = Math.round(total / data.length);
  const max = Math.max(...data.map(item => item.count));
  const min = Math.min(...data.map(item => item.count));

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Рост пользователей</CardTitle>
        <div className="flex gap-4 mt-2 text-sm">
          <div>
            <span className="text-muted-foreground">Всего: </span>
            <span className="font-semibold">{total}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Среднее: </span>
            <span className="font-semibold">{average}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Макс: </span>
            <span className="font-semibold">{max}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Мин: </span>
            <span className="font-semibold">{min}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead className="text-right">Количество пользователей</TableHead>
                <TableHead className="text-right">Изменение</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, index) => {
                const prevCount = index > 0 ? data[index - 1].count : item.count;
                const change = item.count - prevCount;
                const changePercent = prevCount > 0 ? ((change / prevCount) * 100).toFixed(1) : "0";

                return (
                  <TableRow key={item.date}>
                    <TableCell className="font-medium">
                      {format(new Date(item.date), "dd MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.count}
                    </TableCell>
                    <TableCell className="text-right">
                      {index === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"}>
                          {change > 0 ? "+" : ""}{change} ({changePercent}%)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
