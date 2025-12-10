"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Users, AlertTriangle } from "lucide-react";

export default function BroadcastsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState("all");

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post("/admin/broadcasts", {
        title,
        message,
        targetRole,
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Рассылка отправлена ${data.recipientCount} пользователям`);
      setTitle("");
      setMessage("");
      setTargetRole("all");
    },
    onError: () => {
      toast.error("Не удалось отправить рассылку");
    },
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Send className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Массовые рассылки</h1>
          <p className="text-gray-600">Отправка уведомлений всем пользователям платформы</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Новая рассылка</CardTitle>
            <CardDescription>
              Уведомление появится в личном кабинете пользователей
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Заголовок</Label>
              <Input
                id="title"
                placeholder="Важное объявление"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Получатели</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите получателей" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все пользователи</SelectItem>
                  <SelectItem value="student">Только студенты</SelectItem>
                  <SelectItem value="curator">Только кураторы</SelectItem>
                  <SelectItem value="admin">Только администраторы</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                placeholder="Текст уведомления..."
                className="min-h-[150px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="pt-4">
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => broadcastMutation.mutate()}
                disabled={!title || !message || broadcastMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                {broadcastMutation.isPending ? "Отправка..." : "Отправить рассылку"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-yellow-800 flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5" />
                Важно
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-yellow-700">
              <p className="mb-2">
                Рассылки отправляются мгновенно и не могут быть отменены.
              </p>
              <p>
                Пользователи увидят уведомление при следующем обновлении страницы или входе в систему.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-500" />
                Советы
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>• Используйте краткие и понятные заголовки.</p>
              <p>• Для важных технических работ выбирайте время с наименьшей активностью.</p>
              <p>• Ссылки в тексте пока не поддерживаются (планируется).</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
