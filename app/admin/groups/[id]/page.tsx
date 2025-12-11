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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pencil, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [openCombobox, setOpenCombobox] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>("");

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

  const { data: courses } = useQuery<AdminCourseOption[]>({
    queryKey: ["admin", "courses", "options"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/admin/groups/${groupId}/members`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups", groupId, "members"] });
      setSelectedUserId(""); // Reset selection
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

  const bulkEnrollMutation = useMutation({
    mutationFn: async (payload: { courseId: string }) => {
      await apiClient.post(`/admin/groups/${groupId}/enrollments`, payload);
    },
    onSuccess: () => {
      // прогресс и зачисления видны в карточках пользователей
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; courseId?: string | null; startDate?: string | null }) => {
      await apiClient.patch(`/admin/groups/${groupId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "groups", groupId] });
      setIsEditOpen(false);
    },
  });

  const handleEdit = (formData: FormData) => {
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const courseId = (formData.get("courseId") as string)?.trim() || null;
    const startDate = (formData.get("startDate") as string)?.trim() || null;

    if (!name) return;

    updateGroupMutation.mutate({
      name,
      description: description || undefined,
      courseId,
      startDate: startDate ? new Date(startDate).toISOString() : null,
    });
  };

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
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
              <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-2 h-4 w-4" />
                    Редактировать
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Редактирование группы</DialogTitle>
                    <DialogDescription>
                      Измените параметры группы.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      handleEdit(formData);
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Название</Label>
                      <Input
                        id="edit-name"
                        name="name"
                        defaultValue={group.name}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-description">Описание</Label>
                      <Input
                        id="edit-description"
                        name="description"
                        defaultValue={group.description || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-courseId">Курс</Label>
                      <select
                        id="edit-courseId"
                        name="courseId"
                        defaultValue={group.courseId || ""}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Без курса</option>
                        {courses?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-startDate">Дата старта</Label>
                      <Input
                        id="edit-startDate"
                        name="startDate"
                        type="date"
                        defaultValue={
                          group.startDate
                            ? new Date(group.startDate).toISOString().split("T")[0]
                            : ""
                        }
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={updateGroupMutation.isPending}>
                        Сохранить
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
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
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="w-full justify-between"
                      >
                        {selectedUserId
                          ? users?.find((user) => user.id === selectedUserId)?.email
                          : "Выберите пользователя..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Поиск по email..." />
                        <CommandList>
                          <CommandEmpty>Пользователь не найден.</CommandEmpty>
                          <CommandGroup>
                            {users?.map((user) => (
                                <CommandItem
                                  key={user.id}
                                  value={user.id}
                                  keywords={[user.email, user.fullName || ""]}
                                  onSelect={() => {
                                    setSelectedUserId(user.id);
                                    setOpenCombobox(false);
                                  }}
                                >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedUserId === user.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{user.fullName || "Без имени"}</span>
                                  <span className="text-xs text-muted-foreground">{user.email} ({user.role})</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
