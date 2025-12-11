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
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "student" | "admin" | "curator";
  tariff?: "VR" | "LR" | "SR" | null;
  track?: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "student" as "student" | "curator" | "admin",
    tariff: "VR" as "VR" | "LR" | "SR",
    track: "",
  });

  const { data, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users", search, roleFilter, dateFrom, dateTo],
    queryFn: async () => {
      // Построение query параметров внутри queryFn
      const queryParams = new URLSearchParams();
      if (search) queryParams.append("search", search);
      if (roleFilter) queryParams.append("role", roleFilter);
      if (dateFrom) queryParams.append("dateFrom", dateFrom);
      if (dateTo) queryParams.append("dateTo", dateTo);
      
      const response = await apiClient.get(`/admin/users?${queryParams.toString()}`);
      return response.data.data;
    },
    retry: 1,
  });

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
    setRoleFilter("");
    setDateFrom("");
    setDateTo("");
  };

  // Преобразуем roleFilter для отображения в Select (пустая строка -> "all")
  const displayRoleFilter = roleFilter || "all";

  const hasActiveFilters = search || roleFilter || dateFrom || dateTo;

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
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    minLength={6}
                    placeholder="Минимум 6 символов"
                  />
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
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={displayRoleFilter} onValueChange={(value) => setRoleFilter(value === "all" ? "" : value)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Все роли" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все роли</SelectItem>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="curator">Куратор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
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
              <div className="flex-1">
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
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="w-full sm:w-auto"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Сбросить фильтры
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Таблица */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Имя</th>
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
                      </tr>
                    ))
                  : data?.map((user) => (
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
                {!isLoading && data && data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      {hasActiveFilters
                        ? "Пользователи не найдены по заданным фильтрам."
                        : "Пользователей пока нет."}
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
