"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: "Ожидает наставника", color: "bg-amber-100 text-amber-800" },
  in_progress: { label: "В диалоге", color: "bg-blue-100 text-blue-800" },
  answered: { label: "Отвечено", color: "bg-emerald-100 text-emerald-800" },
  closed: { label: "Закрыт", color: "bg-gray-100 text-gray-700" },
};

export default function StudentQuestionsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-questions"],
    queryFn: async () => (await apiClient.get("/questions")).data.data,
    refetchInterval: 15000,
  });

  const create = useMutation({
    mutationFn: async () => (await apiClient.post("/questions", { subject, content })).data.data,
    onSuccess: () => {
      toast.success("Вопрос отправлен наставнику");
      setSubject("");
      setContent("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-questions"] });
    },
    onError: () => toast.error("Не удалось отправить"),
  });

  const items = (data?.items || []) as any[];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Вопросы наставнику</h1>
            <p className="text-gray-600">Получите ответ в формате диалога</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Задать вопрос
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый вопрос</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Тема</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Например: вопрос по уроку" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Сообщение</Label>
                <Textarea id="content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Опишите ваш вопрос подробно..." />
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!subject || !content || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Отправка..." : "Отправить наставнику"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Мои вопросы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-gray-500">Загрузка...</p>}
          {!isLoading && items.length === 0 && (
            <p className="text-sm text-gray-500">У вас пока нет вопросов. Задайте первый!</p>
          )}
          {items.map((q: any) => {
            const last = q.messages?.[0];
            const s = STATUS_LABEL[q.status] || STATUS_LABEL.open;
            return (
              <Link
                key={q.id}
                href={`/dashboard/questions/${q.id}`}
                className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900 truncate">{q.subject}</h3>
                      <Badge className={s.color + " border-0"}>{s.label}</Badge>
                      {q.rating != null && (
                        <Badge className="bg-purple-100 text-purple-800 border-0">Оценка: {q.rating}/10</Badge>
                      )}
                    </div>
                    {last && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{last.content}</p>}
                    <div className="text-xs text-gray-500 mt-2">
                      {new Date(q.updatedAt).toLocaleString("ru-RU")} · сообщений: {q._count?.messages ?? 0}
                      {q.curator && <> · наставник: {q.curator.fullName || q.curator.email}</>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
