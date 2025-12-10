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
import { Users } from "lucide-react";

interface GroupData {
  name: string;
  completedLessons: number;
  memberCount: number;
}

interface GroupLessonViewsTableProps {
  data: GroupData[];
  isLoading: boolean;
}

export function GroupLessonViewsChart({ data, isLoading }: GroupLessonViewsTableProps) {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Активность групп (пройденные уроки)</CardTitle>
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
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Активность групп (пройденные уроки)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Нет данных для отображения</p>
        </CardContent>
      </Card>
    );
  }

  const totalLessons = data.reduce((sum, group) => sum + group.completedLessons, 0);
  const totalMembers = data.reduce((sum, group) => sum + group.memberCount, 0);
  const avgLessonsPerGroup = data.length > 0 ? (totalLessons / data.length).toFixed(1) : "0";

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Активность групп (пройденные уроки)</CardTitle>
        <div className="flex gap-4 mt-2 text-sm">
          <div>
            <span className="text-muted-foreground">Всего уроков: </span>
            <span className="font-semibold">{totalLessons}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Всего участников: </span>
            <span className="font-semibold">{totalMembers}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Среднее на группу: </span>
            <span className="font-semibold">{avgLessonsPerGroup}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Группа</TableHead>
                <TableHead className="text-right">Участников</TableHead>
                <TableHead className="text-right">Пройдено уроков</TableHead>
                <TableHead className="text-right">Уроков на участника</TableHead>
                <TableHead className="text-right">Активность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data
                .sort((a, b) => b.completedLessons - a.completedLessons)
                .map((group) => {
                  const lessonsPerMember = group.memberCount > 0
                    ? (group.completedLessons / group.memberCount).toFixed(1)
                    : "0";
                  
                  // Определяем уровень активности
                  const activityLevel = Number(lessonsPerMember);
                  let activityBadge: "default" | "secondary" | "destructive" = "secondary";
                  let activityText = "Средняя";
                  
                  if (activityLevel >= 10) {
                    activityBadge = "default";
                    activityText = "Высокая";
                  } else if (activityLevel < 5) {
                    activityBadge = "destructive";
                    activityText = "Низкая";
                  }

                  return (
                    <TableRow key={group.name}>
                      <TableCell className="font-medium">
                        {group.name}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{group.memberCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {group.completedLessons}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={
                          activityLevel >= 10 ? "text-green-600 font-semibold" :
                          activityLevel >= 5 ? "text-yellow-600" :
                          "text-red-600"
                        }>
                          {lessonsPerMember}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={activityBadge}
                          className={activityBadge === "default" ? "bg-green-600" : ""}
                        >
                          {activityText}
                        </Badge>
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
