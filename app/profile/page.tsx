"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  LogIn,
  Shield,
  User,
  Eye,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const profileSchema = z.object({
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  phone: z.string().optional(),
  about: z.string().max(500, "Максимум 500 символов").optional(),
  avatarUrl: z.string().optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      // Fix: remove /api prefix as it is added by baseURL
      const response = await apiClient.put("/profile/password", data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Пароль успешно изменен");
      passwordForm.reset();
    },
    onError: (error: any) => {
      console.error("Password change error:", error);
      const message = error.response?.data?.error?.message || "Не удалось изменить пароль";
      toast.error(message);
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Настройки профиля</h1>
        <p className="text-muted-foreground mt-2">
          Управляйте личной информацией и настройками безопасности
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="general">Общие</TabsTrigger>
          <TabsTrigger value="security">Безопасность</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Avatar Section */}
            <Card className="lg:col-span-1 border-none shadow-md">
              <CardContent className="pt-6 flex flex-col items-center text-center">
                <div className="relative group mb-4">
                  <div className="h-32 w-32 rounded-full border-4 border-white bg-gray-100 shadow-lg overflow-hidden flex items-center justify-center text-4xl font-bold text-gray-400 relative">
                    {profileForm.watch("avatarUrl") ? (
                      <img src={profileForm.watch("avatarUrl")!} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || <User className="h-12 w-12" />
                    )}
                    
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => document.getElementById("avatar-upload")?.click()}>
                      <Camera className="text-white h-8 w-8" />
                    </div>
                  </div>
                  <input
                    type="file"
                    id="avatar-upload"
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
                        // Auto-save avatar
                        updateProfileMutation.mutate({ ...profileForm.getValues(), avatarUrl: fileUrl });
                      } catch (error) {
                        console.error("Upload failed", error);
                      }
                    }}
                  />
                </div>
                
                <h3 className="font-bold text-xl">{user?.fullName || "Пользователь"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
                
                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                    {user?.role === "student" ? "Студент" : user?.role}
                  </Badge>
                  {user?.track && (
                    <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                      {user.track}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Form Section */}
            <Card className="lg:col-span-2 border-none shadow-md">
              <CardHeader>
                <CardTitle>Личная информация</CardTitle>
                <CardDescription>
                  Обновите свои контактные данные и информацию о себе
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Полное имя</Label>
                      <Input
                        id="fullName"
                        {...profileForm.register("fullName")}
                        placeholder="Ваше имя"
                      />
                      {profileForm.formState.errors.fullName && (
                        <p className="text-xs text-red-500">{profileForm.formState.errors.fullName.message}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        {...profileForm.register("email")}
                        placeholder="Email"
                        disabled // Email changing usually requires verification
                        className="bg-gray-50"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phone">Телефон</Label>
                      <Input
                        id="phone"
                        {...profileForm.register("phone")}
                        placeholder="+7 (999) 000-00-00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Дата регистрации</Label>
                      <div className="flex items-center h-10 px-3 rounded-md border bg-gray-50 text-sm text-muted-foreground">
                        <Calendar className="mr-2 h-4 w-4" />
                        {user?.createdAt ? formatDate(user.createdAt) : "Неизвестно"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="about">О себе</Label>
                    <Textarea
                      id="about"
                      {...profileForm.register("about")}
                      placeholder="Расскажите о своих целях и интересах..."
                      className="min-h-[100px] resize-none"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {profileForm.watch("about")?.length || 0}/500
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={updateProfileMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {updateProfileMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="security" className="mt-6">
          <Card className="border-none shadow-md max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <CardTitle>Безопасность</CardTitle>
              </div>
              <CardDescription>
                Измените пароль для входа в аккаунт
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Текущий пароль</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      {...passwordForm.register("currentPassword")}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="text-xs text-red-500">{passwordForm.formState.errors.currentPassword.message}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Новый пароль</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        {...passwordForm.register("newPassword")}
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.newPassword && (
                      <p className="text-xs text-red-500">{passwordForm.formState.errors.newPassword.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        {...passwordForm.register("confirmPassword")}
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-xs text-red-500">{passwordForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    type="submit" 
                    disabled={updatePasswordMutation.isPending}
                    variant="outline"
                  >
                    {updatePasswordMutation.isPending ? "Изменение..." : "Обновить пароль"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
