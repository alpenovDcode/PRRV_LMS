"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Plus } from "lucide-react";

interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  createdAt: string;
}

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AdminCourse[]>({
    queryKey: ["admin", "courses"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      await apiClient.patch(`/admin/courses/${id}`, { isPublished });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
    },
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Курсы</h1>
          <p className="text-muted-foreground mt-1">
            Управляйте курсами, их статусом и структурой.
          </p>
        </div>
        <Button variant="default" asChild>
          <Link href="/admin/courses/new">
            <Plus className="mr-2 h-4 w-4" />
            Новый курс
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список курсов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Название</th>
                  <th className="py-2 text-left font-medium">Slug</th>
                  <th className="py-2 text-left font-medium">Статус</th>
                  <th className="py-2 text-left font-medium">Создан</th>
                  <th className="py-2 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3">
                          <Skeleton className="h-4 w-48" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="py-3 text-right">
                          <Skeleton className="h-8 w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : data?.map((course) => (
                      <tr key={course.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium">{course.title}</div>
                        </td>
                        <td className="py-3 text-muted-foreground">{course.slug}</td>
                        <td className="py-3">
                          <Badge variant={course.isPublished ? "default" : "outline"}>
                            {course.isPublished ? "Опубликован" : "Черновик"}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {new Date(course.createdAt).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="py-3 text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              togglePublishMutation.mutate({
                                id: course.id,
                                isPublished: !course.isPublished,
                              })
                            }
                            disabled={togglePublishMutation.isPending}
                          >
                            {course.isPublished ? "Снять с публикации" : "Опубликовать"}
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/courses/${course.id}`}>Настройки</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                {!isLoading && data && data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Курсы еще не добавлены.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


