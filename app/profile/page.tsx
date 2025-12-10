"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Camera, 
  Phone, 
  MapPin, 
  Calendar, 
  BookOpen, 
  CheckCircle2, 
  MessageSquare, 
  LogIn 
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

const profileSchema = z.object({
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  phone: z.string().optional(),
  about: z.string().max(500, "Максимум 500 символов").optional(),
  avatarUrl: z.string().optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
    newPassword: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;



export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  // Fetch full profile data
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await apiClient.get("/profile");
      return response.data.data;
    },
  });

  const user = profileData || authUser;

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      about: "",
      avatarUrl: "",
    },
  });

  // Update form values when data is loaded
  useEffect(() => {
    if (user) {
      profileForm.reset({
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        about: user.about || "",
        avatarUrl: user.avatarUrl || "",
      });
    }
  }, [user, profileForm]);

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const response = await apiClient.put("/profile", data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Профиль обновлен");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
    },
    onError: () => {
      toast.error("Не удалось обновить профиль");
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiClient.put("/profile/password", data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Пароль изменен");
      passwordForm.reset();
    },
    onError: () => {
      toast.error("Не удалось изменить пароль");
    },
  });

  const onProfileSubmit = (values: ProfileFormValues) => {
    updateProfileMutation.mutate(values);
  };

  const onPasswordSubmit = (values: PasswordFormValues) => {
    updatePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  };

  // Inline Edit Mode (Dashboard Style with Inputs)
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Профиль студента</h1>
        <Button 
          onClick={profileForm.handleSubmit(onProfileSubmit)} 
          disabled={updateProfileMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {updateProfileMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card & Contact Info */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card className="border-gray-200 shadow-sm overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
            <CardContent className="relative pt-0 text-center pb-8">
              <div className="relative -mt-16 mb-4 inline-block group">
                <div className="h-32 w-32 rounded-full border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center text-4xl font-bold text-gray-400 relative">
                  {profileForm.watch("avatarUrl") ? (
                    <img src={profileForm.watch("avatarUrl")!} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"
                  )}
                  
                  {/* Avatar Upload Overlay */}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => document.getElementById("avatar-upload-inline")?.click()}>
                    <Camera className="text-white h-8 w-8" />
                  </div>
                </div>
                <input
                  type="file"
                  id="avatar-upload-inline"
                  className="hidden"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                      const uploadPromise = apiClient.post("/upload", formData);
                      
                      toast.promise(uploadPromise, {
                        loading: "Загрузка...",
                        success: "Фото загружено",
                        error: "Ошибка загрузки",
                      });

                      const response = await uploadPromise;
                      const fileUrl = response.data.data.url;
                      profileForm.setValue("avatarUrl", fileUrl);
                    } catch (error) {
                      console.error("Upload failed", error);
                    }
                  }}
                />
              </div>
              
              <div className="space-y-3 px-4">
                <div className="space-y-1">
                  <Label htmlFor="fullName" className="sr-only">Имя</Label>
                  <Input
                    id="fullName"
                    {...profileForm.register("fullName")}
                    placeholder="Ваше имя"
                    className="text-center font-bold text-lg border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent hover:bg-gray-50 focus:bg-white transition-all"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="email" className="sr-only">Email</Label>
                  <Input
                    id="email"
                    {...profileForm.register("email")}
                    placeholder="Email"
                    className="text-center text-gray-500 border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent hover:bg-gray-50 focus:bg-white transition-all h-8"
                  />
                </div>
              </div>
              
              <div className="flex flex-wrap justify-center gap-2 my-4">
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200">
                  {user?.role === "student" ? "Студент" : user?.role}
                </Badge>
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-200">
                  Активен
                </Badge>
                {user?.track && (
                  <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                    Трек: {user.track}
                  </Badge>
                )}
              </div>

              <div className="px-4">
                <Label htmlFor="about" className="sr-only">О себе</Label>
                <Textarea
                  id="about"
                  {...profileForm.register("about")}
                  placeholder="Расскажите о себе..."
                  className="text-sm text-gray-600 min-h-[80px] resize-none border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent hover:bg-gray-50 focus:bg-white transition-all"
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Контактная информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-gray-600">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">Телефон</p>
                  <Input
                    {...profileForm.register("phone")}
                    placeholder="+7 (999) 000-00-00"
                    className="h-8 text-sm border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent hover:bg-gray-50 focus:bg-white transition-all px-2 -ml-2 w-full"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3 text-gray-600">
                <div className="h-8 w-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Адрес</p>
                  <p className="text-sm font-medium text-gray-900">Москва, Россия</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-gray-600">
                <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Дата регистрации</p>
                  <p className="text-sm font-medium text-gray-900">
                    {user?.createdAt ? formatDate(user.createdAt) : "Неизвестно"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security (Password) - Collapsible or Card */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Безопасность</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-3">
                <div className="space-y-1">
                  <Input
                    type="password"
                    {...passwordForm.register("currentPassword")}
                    placeholder="Текущий пароль"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Input
                    type="password"
                    {...passwordForm.register("newPassword")}
                    placeholder="Новый пароль"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Input
                    type="password"
                    {...passwordForm.register("confirmPassword")}
                    placeholder="Подтвердите пароль"
                    className="text-sm"
                  />
                </div>
                <Button 
                  type="submit" 
                  size="sm"
                  variant="outline"
                  disabled={updatePasswordMutation.isPending}
                  className="w-full"
                >
                  {updatePasswordMutation.isPending ? "Изменение..." : "Обновить пароль"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Course Progress & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Course Enrollment & Progress */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Курсы и прогресс</CardTitle>
              <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                Посмотреть все
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {user?.enrollments && user.enrollments.length > 0 ? (
                user.enrollments.map((enrollment: any) => (
                  <div key={enrollment.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <span className="font-medium text-gray-900">{enrollment.course.title}</span>
                      </div>
                      <span className="font-bold text-gray-900">
                        {enrollment.progress || 0}%
                      </span>
                    </div>
                    <Progress value={enrollment.progress || 0} className="h-2" indicatorClassName="bg-green-500" />
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Нет активных курсов
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Последняя активность</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Mock Activity Items */}
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Завершен урок &quot;Введение в платформу&quot;</p>
                    <p className="text-xs text-gray-500">Курс: Основы LMS • 2 часа назад</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Оставлен комментарий к заданию</p>
                    <p className="text-xs text-gray-500">Курс: Основы LMS • 1 день назад</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
                    <LogIn className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Вход в систему</p>
                    <p className="text-xs text-gray-500">IP: 192.168.1.1 • 3 дня назад</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
