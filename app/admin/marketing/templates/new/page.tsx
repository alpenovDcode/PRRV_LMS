"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";

type Layout = "blank" | "promo" | "digest" | "welcome";

const LAYOUTS: Array<{ key: Layout; name: string; description: string }> = [
  { key: "blank", name: "Пустой", description: "Только пустой холст — соберу с нуля." },
  {
    key: "promo",
    name: "Промо с кнопкой",
    description: "Баннер + заголовок + текст + большая кнопка призыва к действию.",
  },
  {
    key: "digest",
    name: "Дайджест",
    description: "Шапка + несколько разделов с заголовком, текстом и ссылками.",
  },
  {
    key: "welcome",
    name: "Welcome",
    description:
      "Приветствие нового пользователя с инструкцией и кнопкой входа в кабинет.",
  },
];

export default function MarketingTemplateNewPage() {
  const router = useRouter();
  const [layout, setLayout] = useState<Layout>("welcome");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post("/admin/marketing/templates", {
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || undefined,
        layout,
        category: "marketing",
      });
      return r.data.data as { id: string };
    },
    onSuccess: (created) => {
      toast.success("Шаблон создан");
      router.push(`/admin/marketing/templates/${created.id}/edit`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось создать шаблон";
      toast.error(msg);
    },
  });

  const canSubmit = name.trim().length > 0 && subject.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/templates"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку шаблонов
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Новый шаблон</h1>
          <p className="text-gray-600">
            Выберите стартовый макет и заполните тему. Дальше всё редактируется в визуальном
            редакторе.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Стартовый макет</CardTitle>
          <CardDescription>
            Это набор блоков для старта — заголовок, текст, кнопка и т.п. В редакторе всё можно
            убрать или поменять.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LAYOUTS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayout(l.key)}
                className={`text-left p-4 rounded-lg border transition-all ${
                  layout === l.key
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{l.name}</span>
                </div>
                <p className="text-xs text-gray-600">{l.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Тема и заголовок</CardTitle>
          <CardDescription>
            Имя — для админки, тема — для инбокса получателя. Прехедер показывается в Gmail / Mail.ru
            рядом с темой.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="tpl-name">Имя шаблона *</Label>
            <Input
              id="tpl-name"
              placeholder="Welcome серия — день 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="tpl-subject">Тема письма *</Label>
            <Input
              id="tpl-subject"
              placeholder="Добро пожаловать в Прорыв 🎉"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="tpl-preheader">Прехедер (скрытый текст под темой)</Label>
            <Input
              id="tpl-preheader"
              placeholder="Готовы начать обучение?"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              ~80 символов. Без прехедера почтовый клиент покажет первые слова письма.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? "Создаём…" : "Создать и открыть редактор"}
        </Button>
      </div>
    </div>
  );
}
