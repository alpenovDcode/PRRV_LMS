"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: {
    members: number;
  };
}

interface AdminCourseOption {
  id: string;
  title: string;
}

export default function AdminGroupsPage() {
  const queryClient = useQueryClient();

  const { data: groups, isLoading: isLoadingGroups } = useQuery<AdminGroup[]>({
    queryKey: ["admin", "groups"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/groups");
      return response.data.data;
    },
  });

  const { data: courses } = useQuery<AdminCourseOption[]>({
    queryKey: ["admin", "courses", "options"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; courseId?: string; startDate?: string }) => {
      await apiClient.post("/admin/groups", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить эту группу? Все участники будут исключены из нее.")) {
      deleteGroupMutation.mutate(id);
    }
  };

  const handleCreate = (formData: FormData) => {
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const courseId = (formData.get("courseId") as string)?.trim();
    const startDate = (formData.get("startDate") as string)?.trim();

    if (!name) return;
    
    createGroupMutation.mutate({ 
      name, 
      description: description || undefined,
      courseId: courseId || undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined
    });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Группы и когорты</h1>
          <p className="text-muted-foreground mt-1">
            Объединяйте пользователей (например, отделы или потоки) и назначайте им курсы.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">
        {/* New group form */}
        <Card>
          <CardHeader>
            <CardTitle>Новая группа / Когорта</CardTitle>
            <CardDescription>
              Создайте группу. Если выбрать курс и дату старта, новые участники автоматически получат доступ к курсу с этой даты.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              action={(formData) => {
                handleCreate(formData);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Название группы</Label>
                <Input id="name" name="name" placeholder="Например: Поток Июнь 2024" required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Описание (опционально)</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Краткое описание"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="courseId">Курс (для когорты)</Label>
                <select 
                  id="courseId" 
                  name="courseId" 
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Без курса (простая группа)</option>
                  {courses?.map(course => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Дата старта (для Drip-контента)</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                />
                <p className="text-xs text-muted-foreground">
                  Если указана, уроки будут открываться относительно этой даты.
                </p>
              </div>

              <Button type="submit" disabled={createGroupMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Создать группу
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Groups list */}
        <Card>
          <CardHeader>
            <CardTitle>Группы</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingGroups ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !groups || groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Layers className="h-10 w-10 mb-3" />
                <p className="font-medium">Группы пока не созданы</p>
                <p className="text-sm">
                  Создайте первую группу с помощью формы слева.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/40">
                    <Link href={`/admin/groups/${group.id}`} className="flex-1 cursor-pointer">
                      <div>
                        <div className="font-medium">{group.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {group.description || "Нет описания"}
                          {/* @ts-ignore */}
                          {group.course && ` • Курс: ${group.course.title}`}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-muted-foreground">
                        {group._count.members} участников
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(group.id)}
                        disabled={deleteGroupMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

