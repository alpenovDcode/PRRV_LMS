"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Plus, Search, X, Wand2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect, Option } from "@/components/ui/multi-select";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "student" | "admin" | "curator";
  tariff?: "VR" | "LR" | "SR" | null;
  track?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
}

const isOnline = (lastActiveAt?: string | null) => {
  if (!lastActiveAt) return false;
  const now = new Date();
  const lastActive = new Date(lastActiveAt);
  const diffMinutes = (now.getTime() - lastActive.getTime()) / (1000 * 60);
  return diffMinutes < 15; // 15 minutes threshold
};

const roleOptions: Option[] = [
  { label: "Студент", value: "student" },
  { label: "Куратор", value: "curator" },
  { label: "Администратор", value: "admin" },
];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "student" as "student" | "curator" | "admin",
    tariff: "VR" as "VR" | "LR" | "SR",
    track: "",
  });

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
    setShowPassword(true);
    toast.info("Пароль сгенерирован");
  };

  // Fetch groups and courses for filters
  const { data: groupsData } = useQuery({
    queryKey: ["admin", "groups", "list"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/groups");
      return response.data.data.map((g: any) => ({ label: g.name, value: g.id }));
    },
    staleTime: 60000,
  });

  const { data: coursesData } = useQuery({
    queryKey: ["admin", "courses", "list"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data.map((c: any) => ({ label: c.title, value: c.id }));
    },
    staleTime: 60000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", search, selectedRoles, selectedGroups, selectedCourses, dateFrom, dateTo, page, limit],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (search) queryParams.append("search", search);
      if (selectedRoles.length > 0) queryParams.append("roles", selectedRoles.join(","));
      if (selectedGroups.length > 0) queryParams.append("groupIds", selectedGroups.join(","));
      if (selectedCourses.length > 0) queryParams.append("courseIds", selectedCourses.join(","));
      if (dateFrom) queryParams.append("dateFrom", dateFrom);
      if (dateTo) queryParams.append("dateTo", dateTo);
      queryParams.append("page", page.toString());
      queryParams.append("limit", limit.toString());
      
      const response = await apiClient.get(`/admin/users?${queryParams.toString()}`);
      return response.data;
    },
    retry: 1,
  });

  const users = data?.data || [];
  const meta = data?.meta;

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof formData) => {
      const response = await apiClient.post("/admin/users", userData);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success("Пользователь успешно создан");
      setIsDialogOpen(false);
      setFormData({ email: "", password: "", fullName: "", role: "student", tariff: "VR", track: "" });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.error?.message || "Не удалось создать пользователя";
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedRoles([]);
    setSelectedGroups([]);
    setSelectedCourses([]);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters = search || selectedRoles.length > 0 || selectedGroups.length > 0 || selectedCourses.length > 0 || dateFrom || dateTo;

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">
              Ошибка загрузки пользователей. Попробуйте обновить страницу.
            </p>
            <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Пользователи</h1>
          <p className="text-muted-foreground mt-1">
            Список всех аккаунтов на платформе.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить пользователя
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Создать нового пользователя</DialogTitle>
              <DialogDescription>
                Заполните форму для создания нового аккаунта на платформе.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      required
                      minLength={6}
                      placeholder="Минимум 6 символов"
                      className="pr-20"
                    />
                    <div className="absolute right-0 top-0 h-full flex items-center pr-2 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={generatePassword}
                        title="Сгенерировать пароль"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Полное имя</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    placeholder="Иван Иванов"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Роль *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: "student" | "curator" | "admin") =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Студент</SelectItem>
                      <SelectItem value="curator">Куратор</SelectItem>
                      <SelectItem value="admin">Администратор</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.role === "student" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="tariff">Тариф</Label>
                      <Select
                        value={formData.tariff}
                        onValueChange={(value: "VR" | "LR" | "SR") =>
                          setFormData({ ...formData, tariff: value })
                        }
                      >
                        <SelectTrigger id="tariff">
                          <SelectValue placeholder="Выберите тариф" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VR">Востребованный (VR)</SelectItem>
                          <SelectItem value="LR">Лидер Рынка (LR)</SelectItem>
                          <SelectItem value="SR">Самостоятельный (SR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="track">Трек обучения</Label>
                      <Select
                        value={formData.track}
                        onValueChange={(value) =>
                          setFormData({ ...formData, track: value })
                        }
                      >
                        <SelectTrigger id="track">
                          <SelectValue placeholder="Выберите трек" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Заполнить расписание">Заполнить расписание</SelectItem>
                          <SelectItem value="Повысить чек">Повысить чек</SelectItem>
                          <SelectItem value="Перейти на онлайн">Перейти на онлайн</SelectItem>
                          <SelectItem value="Стать репетитором">Стать репетитором</SelectItem>
                          <SelectItem value="Перейти на группы">Перейти на группы</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? "Создание..." : "Создать"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список пользователей</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Фильтры и поиск */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              
              <MultiSelect
                options={roleOptions}
                selected={selectedRoles}
                onChange={(vals) => {
                  setSelectedRoles(vals);
                  setPage(1);
                }}
                placeholder="Фильтр по ролям"
              />

              <MultiSelect
                options={groupsData || []}
                selected={selectedGroups}
                onChange={(vals) => {
                  setSelectedGroups(vals);
                  setPage(1);
                }}
                placeholder="Фильтр по группам"
              />

              <MultiSelect
                options={coursesData || []}
                selected={selectedCourses}
                onChange={(vals) => {
                  setSelectedCourses(vals);
                  setPage(1);
                }}
                placeholder="Фильтр по курсам"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full sm:w-auto">
                <Label htmlFor="dateFrom" className="text-xs text-muted-foreground mb-1 block">
                  Дата регистрации от
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex-1 w-full sm:w-auto">
                <Label htmlFor="dateTo" className="text-xs text-muted-foreground mb-1 block">
                  Дата регистрации до
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="w-full sm:w-auto"
                >
                  <X className="h-4 w-4 mr-2" />
                  Сбросить
                </Button>
              )}
            </div>
          </div>

          {/* Таблица */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Имя</th>
                  <th className="py-2 text-left font-medium w-6"></th>
                  <th className="py-2 text-left font-medium">Email</th>
                  <th className="py-2 text-left font-medium">Роль</th>
                  <th className="py-2 text-left font-medium">Тариф</th>
                  <th className="py-2 text-left font-medium">Трек</th>
                  <th className="py-2 text-left font-medium">Зарегистрирован</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3">
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-48" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      </tr>
                    ))
                  : users.map((user: AdminUser) => (
                      <tr
                        key={user.id}
                        className="border-b last:border-0 hover:bg-accent/40"
                      >
                        <td className="py-3">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="font-medium hover:underline"
                          >
                            {user.fullName || "Без имени"}
                          </Link>
                        </td>
                        <td className="py-3 px-1">
                          <div 
                            className={`w-2.5 h-2.5 rounded-full ${isOnline(user.lastActiveAt) ? 'bg-green-500' : 'bg-red-400'}`} 
                            title={isOnline(user.lastActiveAt) ? "В сети" : "Не в сети"}
                          />
                        </td>
                        <td className="py-3 text-muted-foreground">{user.email}</td>
                        <td className="py-3">
                          <Badge variant="outline">
                            {user.role === "student"
                              ? "Студент"
                              : user.role === "curator"
                              ? "Куратор"
                              : "Админ"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {user.role === "student" && user.tariff ? (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                              {user.tariff}
                            </Badge>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {user.role === "student" && user.track ? (
                            <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100">
                              {user.track}
                            </Badge>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {new Date(user.createdAt).toLocaleDateString("ru-RU")}
                        </td>
                      </tr>
                    ))}
                {!isLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      {hasActiveFilters
                        ? "Пользователи не найдены по заданным фильтрам."
                        : "Пользователей пока нет."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                Показано {users.length} из {meta.total} пользователей (Страница {meta.page} из {meta.totalPages})
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Назад
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                    let pNum = i + 1;
                    if (meta.totalPages > 5 && page > 3) {
                       pNum = page - 2 + i;
                    }
                    if (pNum > meta.totalPages) return null;
                    
                    return (
                        <Button
                          key={pNum}
                          variant={page === pNum ? "default" : "ghost"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setPage(pNum)}
                        >
                          {pNum}
                        </Button>
                    );
                  })}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Вперед
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
