"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, Filter, Search, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface InboxItem {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    fullName: string | null;
    email: string;
  };
  lesson: {
    id: string;
    title: string;
  };
  course: {
    id: string;
    title: string;
  };
}

function getStatusLabel(status: InboxItem["status"]) {
  switch (status) {
    case "pending":
      return "На проверке";
    case "approved":
      return "Принято";
    case "rejected":
      return "Отклонено";
    default:
      return status;
  }
}

function getStatusVariant(status: InboxItem["status"]) {
  switch (status) {
    case "pending":
      return "outline" as const;
    case "approved":
      return "default" as const;
    case "rejected":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default function AdminHomeworkPage() {
  const [statusFilter, setStatusFilter] = useState<InboxItem["status"] | "all">("pending");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<InboxItem[]>({
    queryKey: ["admin", "homework", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await apiClient.get(`/curator/homework?${params.toString()}`);
      return response.data.data || [];
    },
  });

  const filtered =
    data?.filter((item) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.user.fullName?.toLowerCase().includes(q) ||
        item.user.email.toLowerCase().includes(q) ||
        item.course.title.toLowerCase().includes(q) ||
        item.lesson.title.toLowerCase().includes(q)
      );
    }) || [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Входящие домашние задания</h1>
            <p className="text-muted-foreground mt-1">
              Проверяйте ответы студентов в удобном inbox-интерфейсе, как в почте.
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as InboxItem["status"] | "all")}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="pending">На проверке</SelectItem>
                <SelectItem value="approved">Принято</SelectItem>
                <SelectItem value="rejected">Отклонено</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по студенту, курсу или уроку..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Домашние задания</CardTitle>
            <CardDescription>
              {isLoading ? "Загружаем список..." : `Найдено: ${filtered.length}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3" />
                <p className="font-medium">Нет заданий по текущим фильтрам</p>
                <p className="text-sm">
                  Попробуйте изменить статус или убрать фильтр поиска.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((item) => (
                  <Link key={item.id} href={`/admin/homework/${item.id}`}>
                    <div className="flex items-center gap-4 rounded-lg border px-4 py-3 hover:bg-accent cursor-pointer transition-colors">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {item.user.fullName || item.user.email}
                          </p>
                          <span className="text-xs text-muted-foreground truncate">
                            {item.course.title} • {item.lesson.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(item.createdAt).toLocaleString("ru-RU")}
                          </span>
                          {item.reviewedAt && (
                            <span>
                              Проверено:{" "}
                              {new Date(item.reviewedAt).toLocaleString("ru-RU")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={getStatusVariant(item.status)}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

