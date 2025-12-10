"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const supportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post("/api/support", {
        subject,
        message,
      });
      return response.data.data;
    },
    onSuccess: () => {
      toast.success("Ваш запрос отправлен. Мы ответим в ближайшее время.");
      setSubject("");
      setMessage("");
    },
    onError: () => {
      toast.error("Не удалось отправить запрос. Попробуйте позже.");
    },
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Поддержка</h1>
          <p className="text-gray-600">Мы всегда готовы помочь вам</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Написать в поддержку</CardTitle>
          <CardDescription>
            Если у вас возникли вопросы или проблемы, опишите их ниже.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Тема</Label>
            <Input
              id="subject"
              placeholder="Например: Не открывается урок"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Сообщение</Label>
            <Textarea
              id="message"
              placeholder="Опишите проблему подробно..."
              className="min-h-[150px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => supportMutation.mutate()}
            disabled={!subject || !message || supportMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            {supportMutation.isPending ? "Отправка..." : "Отправить запрос"}
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-gray-500">
        <p>Вы также можете написать нам на email: support@proryv.ru</p>
      </div>
    </div>
  );
}
