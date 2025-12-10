"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  courseId?: string | null;
  startDate?: string | null;
  course?: {
    title: string;
  } | null;
}

interface GroupMember {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: "student" | "admin" | "curator";
  };
}

interface AdminUserOption {
  id: string;
  email: string;
  fullName: string | null;
  role: "student" | "admin" | "curator";
}

interface AdminCourseOption {
  id: string;
  title: string;
}

export default function AdminGroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;
  const queryClient = useQueryClient();

  const { data: group, isLoading } = useQuery<GroupDetail>({
    queryKey: ["admin", "groups", groupId],
    queryFn: async () => {
      const response = await apiClient.get("/admin/groups");
      const groups: GroupDetail[] = response.data.data;
      return groups.find((g) => g.id === groupId)!;
    },
  });

  const { data: members } = useQuery<GroupMember[]>({
    queryKey: ["admin", "groups", groupId, "members"],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/groups/${groupId}/members`);
      return response.data.data;
    },
  });

  const { data: users } = useQuery<AdminUserOption[]>({
    queryKey: ["admin", "users", "options"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/users");
      return response.data.data;
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/admin/groups/${groupId}/members`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups", groupId, "members"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const params = new URLSearchParams({ userId });
      await apiClient.delete(`/admin/groups/${groupId}/members?${params.toString()}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups", groupId, "members"] });
    },
  });

  const { data: courses } = useQuery<AdminCourseOption[]>({
    queryKey: ["admin", "courses", "options"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  const bulkEnrollMutation = useMutation({
    mutationFn: async (payload: { courseId: string }) => {
      await apiClient.post(`/admin/groups/${groupId}/enrollments`, payload);
    },
    onSuccess: () => {
      // прогресс и зачисления видны в карточках пользователей
    },
  });

  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>("");

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      {isLoading || !group ? (
        <>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
            <div className="flex flex-col gap-1 mt-1">
              {group.description && (
                <p className="text-muted-foreground">{group.description}</p>
              )}
              {(group.course || group.startDate) && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2 p-3 bg-muted/50 rounded-md border">
                  {group.course && (
                    <div>
                      <span className="font-medium text-foreground">Курс:</span> {group.course.title}
                    </div>
                  )}
                  {group.startDate && (
                    <div>
                      <span className="font-medium text-foreground">Старт:</span> {new Date(group.startDate).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.5fr,2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Добавить участника</CardTitle>
                <CardDescription>
                  Добавьте пользователя в эту группу.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Пользователь</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите пользователя" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {(u.fullName || u.email) + ` (${u.role})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!selectedUserId || addMemberMutation.isPending}
                  onClick={() => selectedUserId && addMemberMutation.mutate(selectedUserId)}
                >
                  Добавить в группу
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Участники группы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!members || members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    В группе пока нет участников.
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {member.user.fullName || member.user.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.user.email} • {member.user.role}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeMemberMutation.mutate(member.userId)}
                      >
                        Удалить
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Массовое назначение курса</CardTitle>
              <CardDescription>
                Выдайте доступ к курсу всем участникам этой группы.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label>Курс</Label>
                <Select
                  value={selectedCourseId}
                  onValueChange={setSelectedCourseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите курс" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!selectedCourseId || bulkEnrollMutation.isPending}
                onClick={() =>
                  selectedCourseId &&
                  bulkEnrollMutation.mutate({ courseId: selectedCourseId })
                }
              >
                Выдать курс всей группе
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


