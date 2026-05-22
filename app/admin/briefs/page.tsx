"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { FileText, Image as ImageIcon, ClipboardList } from "lucide-react";

interface BriefSummary {
  id: string;
  userId: string;
  status: string;
  fio: string | null;
  subject: string | null;
  completedAt: string | null;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
  casesCount: number;
  filesCount: number;
}

// Бейдж статуса брифа. Ключевой случай — бриф, который был завершён,
// а затем переоткрыт на правки (status=in_progress, но completedAt
// уже проставлен): куратор должен видеть «На правках», а не думать,
// что анкета пропала.
function briefStatusBadge(status: string, completedAt: string | null) {
  if (status === "completed") {
    return { label: "Завершён", variant: "default" as const };
  }
  if (completedAt) {
    return { label: "На правках у ученика", variant: "secondary" as const };
  }
  return { label: "Черновик", variant: "secondary" as const };
}

export default function AdminBriefsPage() {
  // По умолчанию показываем ВСЕ брифы. Раньше дефолтом был таб
  // «Завершённые» — и переоткрытый на правки бриф «исчезал» из списка,
  // хотя данные в БД целы. См. фикс пропажи анкет.
  const [status, setStatus] = useState<"completed" | "in_progress" | "all">(
    "all"
  );

  const { data, isLoading } = useQuery<BriefSummary[]>({
    queryKey: ["admin", "briefs", status],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/briefs?status=${status}`);
      return r.data.data;
    },
  });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ClipboardList className="h-6 w-6" />
          Брифы учеников
        </h1>
        <p className="mt-1 text-muted-foreground">
          Анкеты для оформления визуальной упаковки, заполненные учениками.
        </p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList>
          <TabsTrigger value="completed">Завершённые</TabsTrigger>
          <TabsTrigger value="in_progress">Черновики</TabsTrigger>
          <TabsTrigger value="all">Все</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>
            {isLoading
              ? "Загрузка…"
              : `Найдено: ${data?.length || 0}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data?.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Пока ничего нет.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Ученик</th>
                    <th className="py-2 text-left font-medium">Предмет</th>
                    <th className="py-2 text-left font-medium">Кейсы</th>
                    <th className="py-2 text-left font-medium">Файлы</th>
                    <th className="py-2 text-left font-medium">Статус</th>
                    <th className="py-2 text-left font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="py-3">
                        <Link
                          href={`/admin/briefs/${b.id}`}
                          className="font-medium hover:underline"
                        >
                          {b.fio || b.user.fullName || b.user.email}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {b.user.email}
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {b.subject || "—"}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          {b.casesCount}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ImageIcon className="h-3.5 w-3.5" />
                          {b.filesCount}
                        </span>
                      </td>
                      <td className="py-3">
                        {(() => {
                          const sb = briefStatusBadge(b.status, b.completedAt);
                          return <Badge variant={sb.variant}>{sb.label}</Badge>;
                        })()}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {format(
                          new Date(b.completedAt || b.updatedAt),
                          "d MMM yyyy",
                          { locale: ru }
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
