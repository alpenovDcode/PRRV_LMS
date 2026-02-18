"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import { formatActivityDetails } from "@/lib/activity-formatter";
import { 
  Phone, 
  MapPin, 
  Users, 
  Calendar, 
  MessageSquare, 
  ArrowLeft,
  BookOpen,
  CircleCheck,
  LogIn,
  Pencil,
  Download
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessManager } from "./_components/access-manager";

type UserRole = "student" | "admin" | "curator";

interface AdminUserDetail {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
  phone: string | null;
  telegram: string | null;
  about: string | null;
  track: string | null;
  tariff: "VR" | "LR" | "SR" | null;
  lastActiveAt?: string | null;
  groupMembers: {
    group: {
      id: string;
      name: string;
    }
  }[];
  enrollments: {
    id: string;
    courseId: string;
    status: "active" | "expired" | "frozen";
    startDate: string;
    expiresAt: string | null;
    progress: number;
    course: {
      id: string;
      title: string;
    };
  }[];
  _count: {
    progress: number;
    homework: number;
    quizAttempts: number;
    lessonComments: number;
    userSessions: number;
  };
  activity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "homework" | "quiz" | "comment" | "enrollment" | "login" | "system" | "lesson_completed";
  title: string;
  description: string;
  date: string;
  courseName?: string | null;
}

const updateUserSchema = z.object({
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  role: z.enum(["student", "admin", "curator"]),
  phone: z.string().optional(),
  about: z.string().optional(),
  track: z.string().optional(),
  tariff: z.enum(["VR", "LR", "SR"]).optional().nullable(),
  password: z.string().optional().or(z.literal("")),
});

type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

function EditUserDialog({ user, open, onOpenChange, onSuccess }: { 
  user: AdminUserDetail; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const form = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      fullName: user.fullName || "",
      email: user.email,
      role: user.role,
      phone: user.phone || "",
      about: user.about || "",
      track: user.track || "",
      tariff: user.tariff || null,
      password: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormValues) => {
      // Filter out empty password
      const payload: any = { ...data };
      if (!payload.password) delete payload.password;
      
      const response = await apiClient.patch(`/admin/users/${user.id}`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success("Профиль пользователя обновлен");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Не удалось обновить профиль");
    },
  });

  const onSubmit = (data: UpdateUserFormValues) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Редактировать профиль</DialogTitle>
          <DialogDescription>
            Измените данные пользователя здесь. Нажмите сохранить, когда закончите.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">ФИО</Label>
              <Input id="fullName" {...form.register("fullName")} />
              {form.formState.errors.fullName && (
                <p className="text-xs text-red-500">{form.formState.errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Роль</Label>
              <Select 
                defaultValue={user.role} 
                onValueChange={(value) => form.setValue("role", value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="curator">Куратор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tariff">Тариф</Label>
            <Select 
              defaultValue={user.tariff || undefined} 
              onValueChange={(value) => form.setValue("tariff", value as "VR" | "LR" | "SR")}
            >
              <SelectTrigger>
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
              defaultValue={user.track || ""} 
              onValueChange={(value) => form.setValue("track", value)}
            >
              <SelectTrigger>
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

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input id="phone" {...form.register("phone")} placeholder="+7 (999) 000-00-00" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="about">О себе</Label>
            <Textarea id="about" {...form.register("about")} placeholder="Краткая информация..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Новый пароль (необязательно)</Label>
            <Input id="password" type="password" {...form.register("password")} placeholder="Оставьте пустым, чтобы не менять" />
            {form.formState.errors.password && (
              <p className="text-xs text-red-500">{form.formState.errors.password.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [isEditOpen, setIsEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ["admin", "users", userId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/users/${userId}`);
      return response.data.data;
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/admin/users/${userId}/impersonate`, {}, {
        withCredentials: true,
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Вход выполнен от имени ${data.user.fullName || data.user.email}`);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 100);
    },
    onError: () => {
      toast.error("Не удалось войти от имени пользователя");
    },
  });

  const [isBlockOpen, setIsBlockOpen] = useState(false);
  const [isFreezeOpen, setIsFreezeOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [freezeDuration, setFreezeDuration] = useState("7"); // Days

  const router = useRouter(); // Need router for redirect after delete

  const blockMutation = useMutation({
    mutationFn: async (shouldBlock: boolean) => {
      await apiClient.patch(`/admin/users/${userId}`, { isBlocked: shouldBlock });
    },
    onSuccess: (_, shouldBlock) => {
      toast.success(shouldBlock ? "Пользователь заблокирован" : "Пользователь разблокирован");
      setIsBlockOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
    },
    onError: () => toast.error("Ошибка при обновлении статуса блокировки"),
  });

  const freezeMutation = useMutation({
    mutationFn: async () => {
      const date = new Date();
      date.setDate(date.getDate() + parseInt(freezeDuration));
      await apiClient.patch(`/admin/users/${userId}`, { frozenUntil: date.toISOString() });
    },
    onSuccess: () => {
      toast.success(`Пользователь заморожен на ${freezeDuration} дней`);
      setIsFreezeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
    },
    onError: () => toast.error("Ошибка при заморозке пользователя"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast.success("Пользователь удален");
      setIsDeleteOpen(false);
      router.push("/admin/users");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || "Ошибка при удалении пользователя");
    },
  });

  const unfreezeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch(`/admin/users/${userId}`, { frozenUntil: null });
    },
    onSuccess: () => {
      toast.success("Заморозка снята");
      queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
    },
  });

  if (isLoading || !user) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  const isBlocked = (user as any).isBlocked;
  const frozenUntil = (user as any).frozenUntil;
  const isFrozen = frozenUntil && new Date(frozenUntil) > new Date();

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <Link href="/admin/users">Назад к списку</Link>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white" onClick={() => setIsEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
          {user.role === "student" && (
            <Button
              onClick={() => impersonateMutation.mutate()}
              disabled={impersonateMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Войти
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить пользователя?</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Все данные пользователя, включая прогресс и домашние задания, будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBlockOpen} onOpenChange={setIsBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isBlocked ? "Разблокировать пользователя?" : "Заблокировать пользователя?"}</DialogTitle>
            <DialogDescription>
              {isBlocked 
                ? "Пользователь снова сможет входить в систему и проходить курсы." 
                : "Пользователь потеряет доступ к платформе до разблокировки."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBlockOpen(false)}>Отмена</Button>
            <Button 
              variant={isBlocked ? "default" : "destructive"} 
              onClick={() => blockMutation.mutate(!isBlocked)}
              disabled={blockMutation.isPending}
            >
              {isBlocked ? "Разблокировать" : "Заблокировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFreezeOpen} onOpenChange={setIsFreezeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заморозить доступ</DialogTitle>
            <DialogDescription>
              Выберите период заморозки. В это время пользователь не сможет проходить обучение, но дедлайны будут сдвинуты (если настроено).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Период заморозки</Label>
            <Select value={freezeDuration} onValueChange={setFreezeDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 дней</SelectItem>
                <SelectItem value="14">14 дней</SelectItem>
                <SelectItem value="30">30 дней</SelectItem>
                <SelectItem value="90">3 месяца</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFreezeOpen(false)}>Отмена</Button>
            <Button onClick={() => freezeMutation.mutate()} disabled={freezeMutation.isPending}>
              Заморозить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditUserDialog 
        user={user} 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] })}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Профиль {user.role === 'student' ? 'студента' : user.role === 'curator' ? 'куратора' : 'администратора'}</h1>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Профиль</TabsTrigger>
          <TabsTrigger value="access">Доступы</TabsTrigger>
          <TabsTrigger value="certificates">Сертификаты</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
           {/* Existing layout content here */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Profile Card */}
            <div className="space-y-6">
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <div className="p-6 flex flex-col items-center text-center border-b border-gray-100">
                  <div className="relative mb-4">
                    <div className="h-32 w-32 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-4xl font-semibold overflow-hidden border-4 border-white shadow-sm">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.fullName || "User"} className="h-full w-full object-cover" />
                      ) : (
                        user.fullName?.[0]?.toUpperCase() || user.email[0].toUpperCase()
                      )}
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{user.fullName || "Без имени"}</h2>
                  <p className="text-gray-500 text-sm mb-3">{user.email}</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Badge 
                      className={`${
                        user.role === "admin" ? "bg-purple-100 text-purple-700" : 
                        user.role === "curator" ? "bg-blue-100 text-blue-700" : 
                        "bg-green-100 text-green-700"
                      } hover:bg-opacity-80 border-none px-3 py-1`}
                    >
                      {user.role === "student" ? "Студент" : user.role === "curator" ? "Куратор" : "Администратор"}
                    </Badge>
                    {isBlocked ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-none px-3 py-1">
                        Заблокирован
                      </Badge>
                    ) : isFrozen ? (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none px-3 py-1">
                        Заморожен до {new Date(frozenUntil).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none px-3 py-1">
                        Активен
                      </Badge>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 w-full mt-6 text-sm">
                    <Button variant="outline" size="sm" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => setIsBlockOpen(true)}>
                      {isBlocked ? "Разблокировать" : "Заблокировать"}
                    </Button>
                    {isFrozen ? (
                        <Button variant="outline" size="sm" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => unfreezeMutation.mutate()}>
                          Разморозить
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setIsFreezeOpen(true)}>
                          Заморозить
                        </Button>
                    )}
                    <Button variant="outline" size="sm" className="w-full col-span-2 text-gray-600 border-gray-200 hover:bg-gray-100" onClick={() => setIsDeleteOpen(true)}>
                      Удалить профиль
                    </Button>
                  </div>

                  {user.about && (
                    <p className="text-sm text-gray-600 mt-4 max-w-xs">
                      {user.about}
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    {user.tariff && (
                      <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                        Тариф: {user.tariff}
                      </Badge>
                    )}
                    {user.track && (
                      <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                        Трек: {user.track}
                      </Badge>
                    )}
                    {user.groupMembers && user.groupMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.groupMembers.map((gm, i) => (
                          <Badge key={i} variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                            Поток: {gm.group.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-6 space-y-6">
                  <h3 className="font-semibold text-gray-900">Контактная информация</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Phone className="h-5 w-5 text-purple-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.phone || "Не указан"}</p>
                        <p className="text-xs text-gray-500">Мобильный</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <MessageSquare className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.telegram || "Не указан"}</p>
                        <p className="text-xs text-gray-500">Telegram</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-purple-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Москва, Россия</p>
                        <p className="text-xs text-gray-500">Адрес</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Users className="h-5 w-5 text-purple-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Иванов Иван</p>
                        <p className="text-xs text-gray-500">Куратор</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-purple-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{formatDate(user.createdAt)}</p>
                        <p className="text-xs text-gray-500">Дата регистрации</p>
                      </div>
                      </div>


                    <div className="flex items-start gap-3">
                      <div className="flex h-5 items-center justify-center w-5 mt-0.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${user.lastActiveAt && (new Date().getTime() - new Date(user.lastActiveAt).getTime() < 15 * 60 * 1000) ? 'bg-green-500' : 'bg-red-400'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.lastActiveAt 
                            ? new Date(user.lastActiveAt).toLocaleString("ru-RU", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : "Нет данных"}
                        </p>
                        <p className="text-xs text-gray-500">Последняя активность</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column: Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Course Enrollment & Progress */}
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-bold text-gray-900">Курсы и прогресс</CardTitle>
                  <Button variant="ghost" className="text-purple-600 text-sm font-medium hover:text-purple-700 hover:bg-purple-50">
                    Показать все
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  {user.enrollments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>Нет активных курсов</p>
                    </div>
                  ) : (
                    user.enrollments.map((enrollment) => (
                      <div key={enrollment.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-blue-600" />
                            </div>
                            <span className="font-semibold text-gray-900">{enrollment.course.title}</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">
                            {enrollment.progress || 0}%
                          </span>
                        </div>
                        <Progress value={enrollment.progress || 0} className="h-2 bg-gray-100" indicatorClassName="bg-green-500" />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-gray-900">Последняя активность</CardTitle>
                </CardHeader>
                <CardContent>
                   {/* ... Keep activity content ... */}
                  <div className="space-y-6">
                    {user.activity && user.activity.length > 0 ? (
                      user.activity.map((activity) => (
                        <div key={activity.id} className="flex gap-4">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            activity.type === 'homework' ? 'bg-green-100 text-green-600' :
                            activity.type === 'comment' ? 'bg-blue-100 text-blue-600' :
                            activity.type === 'lesson_completed' ? 'bg-green-100 text-green-600' :
                            'bg-purple-100 text-purple-600'
                          }`}>
                            {activity.type === 'homework' ? <CircleCheck className="h-5 w-5" /> :
                            activity.type === 'comment' ? <MessageSquare className="h-5 w-5" /> :
                            activity.type === 'lesson_completed' ? <CircleCheck className="h-5 w-5" /> :
                            <LogIn className="h-5 w-5" />}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{activity.title}</h4>
                            <p className="text-sm text-gray-500">
                              {activity.courseName && <span className="text-gray-400">Курс: {activity.courseName} • </span>}
                              {formatActivityDetails(activity.type, activity.description)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{formatDate(activity.date)}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        Нет недавней активности
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
           </div>
        </TabsContent>

        <TabsContent value="access" className="space-y-6">
           <Card className="border-none shadow-sm bg-white">
             <CardHeader>
               <CardTitle>Управление доступами</CardTitle>
             </CardHeader>
             <CardContent className="space-y-6">
               {user.enrollments.length === 0 ? (
                 <div className="text-center py-12 text-gray-500">
                    <p>Нет активных курсов для настройки доступа</p>
                 </div>
               ) : (
                 <div className="divide-y">
                   {user.enrollments.map((enrollment) => (
                     <div key={enrollment.id} className="py-4 flex items-center justify-between">
                       <div>
                         <h3 className="font-semibold text-lg">{enrollment.course.title}</h3>
                         <div className="flex gap-2 text-sm text-gray-500 mt-1">
                           <span>Статус: {enrollment.status === 'active' ? 'Активен' : 'Завершен'}</span>
                           <span>•</span>
                           <span>Срок: {enrollment.expiresAt ? formatDate(enrollment.expiresAt) : 'Бессрочно'}</span>
                           <span>•</span>
                           <span>Прогресс: {enrollment.progress}%</span>
                         </div>
                         {/* @ts-ignore */}
                         {(enrollment.restrictedModules?.length > 0 || enrollment.restrictedLessons?.length > 0) && (
                            <div className="mt-2 text-sm text-orange-600">
                              Есть персональные ограничения (скрытые модули/уроки)
                            </div>
                         )}
                       </div>
                       <AccessManager 
                         enrollment={enrollment} 
                         onUpdate={() => queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] })}
                       />
                     </div>
                   ))}
                 </div>
               )}
             </CardContent>
           </Card>

        </TabsContent>

        <TabsContent value="certificates" className="space-y-6">
          <UserCertificates userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserCertificates({ userId }: { userId: string }) {
  const { data: certificates, isLoading } = useQuery<any[]>({
    queryKey: ["admin", "users", userId, "certificates"],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/users/${userId}/certificates`);
      return response.data.data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Загрузка сертификатов...</div>;
  }

  if (!certificates || certificates.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-white">
        <CardHeader>
          <CardTitle>Сертификаты пользователя</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <p>У пользователя нет выданных сертификатов</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader>
        <CardTitle>Сертификаты ({certificates.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-24 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={cert.pdfUrl}
                    alt={cert.course.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{cert.course.title}</h4>
                  <p className="text-sm text-gray-500 font-mono">{cert.certificateNumber}</p>
                  <p className="text-xs text-gray-400">
                    Выдан: {new Date(cert.issuedAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(cert.pdfUrl, "_blank")}
              >
                <Download className="h-4 w-4 mr-2" />
                Скачать PDF
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

