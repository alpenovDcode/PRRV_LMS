"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellPlus } from "lucide-react";

export default function AdminNotificationsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Системные уведомления</h1>
          <p className="text-muted-foreground mt-1">
            Рассылайте важные сообщения студентам (email / in-app).
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
            Форма рассылки будет связана с реальным email-провайдером на одном из следующих этапов.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Заголовок</Label>
            <Input id="title" placeholder="Например: Обновление программы курса" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Сообщение</Label>
            <Textarea
              id="message"
              rows={5}
              placeholder="Кратко опишите, что изменилось..."
              disabled
            />
          </div>
          <Button disabled>Отправить (будет реализовано позже)</Button>
        </CardContent>
      </Card>
    </div>
  );
}


