"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BellPlus, Send, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState("all");

  // Fetch users for statistics
  const { data: usersData } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/users");
      return response.data.data;
    },
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; targetRole: string }) => {
      const response = await apiClient.post("/admin/broadcasts", data);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Уведомление отправлено ${data.data.recipientCount} пользователям`);
      setTitle("");
      setMessage("");
      setTargetRole("all");
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error?.message || "Не удалось отправить уведомления";
      toast.error(errorMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !message.trim()) {
      toast.error("Заполните все поля");
      return;
    }

    sendNotificationMutation.mutate({ title, message, targetRole });
  };

  const getRecipientCount = () => {
    if (!usersData) return 0;
    if (targetRole === "all") return usersData.length;
    return usersData.filter(u => u.role === targetRole).length;
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Системные уведомления</h1>
          <p className="text-muted-foreground mt-1">
            Рассылайте важные сообщения студентам через внутреннюю систему уведомлений.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellPlus className="h-5 w-5" />
            Новое уведомление
          </CardTitle>
          <CardDescription>
            Уведомление будет отправлено выбранной группе пользователей и отобразится в их панели уведомлений.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target">Кому отправить</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger id="target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Всем пользователям ({usersData?.length || 0})
                    </div>
                  </SelectItem>
                  <SelectItem value="student">
                    Только студентам ({usersData?.filter(u => u.role === 'student').length || 0})
                  </SelectItem>
                  <SelectItem value="curator">
                    Только кураторам ({usersData?.filter(u => u.role === 'curator').length || 0})
                  </SelectItem>
                  <SelectItem value="admin">
                    Только администраторам ({usersData?.filter(u => u.role === 'admin').length || 0})
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Получателей: {getRecipientCount()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Заголовок</Label>
              <Input
                id="title"
                placeholder="Например: Обновление программы курса"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                rows={5}
                placeholder="Кратко опишите, что изменилось..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/500
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={sendNotificationMutation.isPending || !title.trim() || !message.trim()}
              className="w-full sm:w-auto"
            >
              {sendNotificationMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Отправить уведомление
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base">💡 Совет</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Уведомления отображаются в колокольчике в правом верхнем углу</p>
          <p>• Студенты получат уведомление в реальном времени (обновление каждые 5 секунд)</p>
          <p>• Используйте эту функцию для важных объявлений, изменений в расписании или новых материалов</p>
        </CardContent>
      </Card>
    </div>
  );
}
