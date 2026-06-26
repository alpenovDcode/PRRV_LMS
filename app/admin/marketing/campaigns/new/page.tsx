"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Users,
  FileText,
  Settings as SettingsIcon,
  Calendar,
  CheckCircle2,
  Circle,
  TestTube2,
  Plus,
  Minus,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface SegmentOption {
  id: string;
  name: string;
  contactCount: number;
}

interface TemplateOption {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
}

const STEPS = [
  { key: "recipients" as const, label: "Получатели", icon: Users },
  { key: "content" as const, label: "Контент", icon: FileText },
  { key: "settings" as const, label: "Настройки", icon: SettingsIcon },
  { key: "schedule" as const, label: "Расписание", icon: Calendar },
];
type StepKey = (typeof STEPS)[number]["key"];

function NewCampaignContent() {
  const router = useRouter();
  const search = useSearchParams();
  const preselectedSegmentId = search.get("segmentId");
  const preselectedTemplateId = search.get("templateId");

  const [step, setStep] = useState<StepKey>("recipients");

  // Шаг 1: получатели
  const [segmentId, setSegmentId] = useState<string | null>(preselectedSegmentId);

  // Шаг 2: контент
  const [templateId, setTemplateId] = useState<string | null>(preselectedTemplateId);

  // Шаг 3: настройки
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [fromName, setFromName] = useState(process.env.NEXT_PUBLIC_EMAIL_MARKETING_FROM_NAME || "Прорыв");
  const [fromEmail, setFromEmail] = useState(
    process.env.NEXT_PUBLIC_EMAIL_MARKETING_FROM_EMAIL || ""
  );

  // A/B сплит-тест (advanced в шаге Настройки).
  const [abEnabled, setAbEnabled] = useState(false);
  const [abVariants, setAbVariants] = useState<Array<{ subject: string; fromName: string; sharePercent: number }>>([
    { subject: "", fromName: "", sharePercent: 10 },
    { subject: "", fromName: "", sharePercent: 10 },
  ]);
  const [abWinnerMetric, setAbWinnerMetric] = useState<"opened" | "clicked">("opened");
  const [abWinnerAfterHours, setAbWinnerAfterHours] = useState(4);

  // Шаг 4: расписание
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: segments } = useQuery({
    queryKey: ["marketing-segments-opts"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/segments");
      return r.data.data.items as SegmentOption[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["marketing-templates-opts"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/templates");
      return r.data.data.items as TemplateOption[];
    },
  });

  // Когда выбран шаблон — заполняем subject / preheader / name по умолчанию.
  useEffect(() => {
    if (!templateId || !templates) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      if (!subject) setSubject(tpl.subject);
      if (!preheader && tpl.preheader) setPreheader(tpl.preheader);
      if (!name) setName(tpl.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  const selectedSegment = segments?.find((s) => s.id === segmentId);
  const selectedTemplate = templates?.find((t) => t.id === templateId);

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const abTest = abEnabled
        ? {
            enabled: true,
            variants: abVariants.map((v) => ({
              subject: v.subject.trim(),
              fromName: v.fromName.trim() || undefined,
              sharePercent: v.sharePercent,
            })),
            winnerMetric: abWinnerMetric,
            winnerAfterHours: abWinnerAfterHours,
          }
        : undefined;
      const r = await apiClient.post("/admin/marketing/campaigns", {
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || undefined,
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        templateId,
        segmentId,
        abTest,
      });
      return r.data.data as { id: string };
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (vars: { campaignId: string; scheduledAt?: string }) => {
      const r = await apiClient.post(`/admin/marketing/campaigns/${vars.campaignId}/send`, {
        scheduledAt: vars.scheduledAt,
      });
      return r.data.data;
    },
  });

  async function handleFinish() {
    try {
      const campaign = await createCampaignMutation.mutateAsync();
      await sendMutation.mutateAsync({
        campaignId: campaign.id,
        scheduledAt:
          scheduleMode === "later" && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
      });
      toast.success(
        scheduleMode === "now"
          ? "Кампания запущена"
          : "Кампания запланирована"
      );
      router.push(`/admin/marketing/campaigns/${campaign.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Не удалось запустить";
      toast.error(msg);
    }
  }

  const abShareSum = abVariants.reduce((a, v) => a + v.sharePercent, 0);
  const abValid =
    !abEnabled ||
    (abVariants.every((v) => v.subject.trim().length > 0) &&
      abVariants.length >= 2 &&
      abVariants.length <= 4 &&
      abShareSum > 0 &&
      abShareSum < 100);

  const canProceed: Record<StepKey, boolean> = {
    recipients: !!segmentId,
    content: !!templateId,
    settings:
      name.trim().length > 0 && subject.trim().length > 0 && fromEmail.trim().length > 0 && abValid,
    schedule: scheduleMode === "now" || (scheduleMode === "later" && scheduledAt !== ""),
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/campaigns"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку кампаний
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Send className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Новая кампания</h1>
          <p className="text-gray-600">4 шага: получатели, шаблон, настройки, расписание.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const currentIdx = STEPS.findIndex((x) => x.key === step);
              const isActive = step === s.key;
              const isDone = idx < currentIdx;
              return (
                <div key={s.key} className="flex items-center flex-1 gap-2">
                  <div
                    className={`flex items-center gap-2 ${
                      isActive ? "text-emerald-600 font-semibold" : isDone ? "text-emerald-600" : "text-gray-400"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isActive ? (
                      <Icon className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                    <span className="text-sm whitespace-nowrap">
                      {idx + 1}. {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {step === "recipients" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Получатели</CardTitle>
            <CardDescription>
              Выберите сохранённый сегмент. Если нужного нет —{" "}
              <Link href="/admin/marketing/segments/new" className="text-emerald-600 underline">
                создайте сегмент
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(segments ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSegmentId(s.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                  segmentId === s.id
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div>
                  <div className="font-medium">{s.name}</div>
                </div>
                <Badge variant="outline">{s.contactCount.toLocaleString("ru-RU")} контактов</Badge>
              </button>
            ))}
            {(segments ?? []).length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">
                Нет сохранённых сегментов.{" "}
                <Link
                  href="/admin/marketing/segments/new"
                  className="text-emerald-600 underline"
                >
                  Создать
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "content" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Шаблон письма</CardTitle>
            <CardDescription>
              Используется тема и компилированный HTML шаблона. Тема перезапишется на шаге 3, если
              понадобится.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(templates ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  templateId === t.id
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-gray-500 truncate">{t.subject}</div>
              </button>
            ))}
            {(templates ?? []).length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">
                Шаблонов нет.{" "}
                <Link href="/admin/marketing/templates/new" className="text-emerald-600 underline">
                  Создать
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle>3. Настройки отправки</CardTitle>
            <CardDescription>
              Имя видно только в админке. Тема и От — то, что увидит получатель в инбоксе.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="c-name">Имя кампании *</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="c-subj">Тема письма *</Label>
              <Input id="c-subj" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="c-pre">Прехедер</Label>
              <Input id="c-pre" value={preheader} onChange={(e) => setPreheader(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-fname">От (имя)</Label>
                <Input
                  id="c-fname"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="c-fmail">От (email) *</Label>
                <Input
                  id="c-fmail"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="marketing@prrv.tech"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={abEnabled}
                  onCheckedChange={(c) => setAbEnabled(c === true)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    <TestTube2 className="h-4 w-4 text-purple-600" />
                    A/B сплит-тест
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Маленькую долю получает каждый вариант; через {abWinnerAfterHours} ч система
                    автоматически выбирает победителя по {abWinnerMetric === "opened" ? "open rate" : "click rate"}
                    {" "}и отправляет оставшимся.{" "}
                    <span className="text-amber-700">
                      Не работает в bulk-режиме Unisender (один subject на createCampaign).
                    </span>
                  </p>
                </div>
              </label>

              {abEnabled && (
                <div className="mt-4 space-y-3 pl-7">
                  {abVariants.map((v, idx) => (
                    <Card key={idx} className="bg-purple-50 border-purple-200">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">Вариант {String.fromCharCode(65 + idx)}</div>
                          {abVariants.length > 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setAbVariants(abVariants.filter((_, i) => i !== idx))
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="md:col-span-2">
                            <Label className="text-xs">Тема</Label>
                            <Input
                              value={v.subject}
                              onChange={(e) => {
                                const next = [...abVariants];
                                next[idx] = { ...v, subject: e.target.value };
                                setAbVariants(next);
                              }}
                              placeholder={`Тема варианта ${String.fromCharCode(65 + idx)}`}
                              className="mt-0.5"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Доля (%)</Label>
                            <Input
                              type="number"
                              min={1}
                              max={50}
                              value={v.sharePercent}
                              onChange={(e) => {
                                const next = [...abVariants];
                                next[idx] = { ...v, sharePercent: Math.max(1, Math.min(50, Number(e.target.value) || 0)) };
                                setAbVariants(next);
                              }}
                              className="mt-0.5"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {abVariants.length < 4 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        setAbVariants([
                          ...abVariants,
                          { subject: "", fromName: "", sharePercent: 10 },
                        ])
                      }
                    >
                      <Plus className="h-3 w-3" />
                      Ещё вариант
                    </Button>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Метрика победы</Label>
                      <div className="flex gap-1 mt-1">
                        {(["opened", "clicked"] as const).map((m) => (
                          <Button
                            key={m}
                            variant={abWinnerMetric === m ? "default" : "outline"}
                            size="sm"
                            onClick={() => setAbWinnerMetric(m)}
                          >
                            {m === "opened" ? "Открытия" : "Клики"}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Через сколько часов решать</Label>
                      <Input
                        type="number"
                        min={1}
                        max={168}
                        value={abWinnerAfterHours}
                        onChange={(e) =>
                          setAbWinnerAfterHours(Math.max(1, Math.min(168, Number(e.target.value) || 4)))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div
                    className={`text-xs rounded p-2 ${
                      abShareSum > 0 && abShareSum < 100
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-900 border border-amber-200"
                    }`}
                  >
                    Сумма долей вариантов: <strong>{abShareSum}%</strong>. Остальные {100 - abShareSum}%
                    получают победителя через {abWinnerAfterHours} ч. Сумма должна быть {">"} 0 и {"<"} 100.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "schedule" && (
        <Card>
          <CardHeader>
            <CardTitle>4. Расписание</CardTitle>
            <CardDescription>Запустить сейчас или запланировать на конкретный момент.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleMode("now")}
                className={`p-4 rounded-lg border text-left ${
                  scheduleMode === "now"
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Запустить сейчас</div>
                <p className="text-xs text-gray-600 mt-1">Очередь начнёт работу в течение 10 секунд.</p>
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("later")}
                className={`p-4 rounded-lg border text-left ${
                  scheduleMode === "later"
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Запланировать</div>
                <p className="text-xs text-gray-600 mt-1">
                  Cron-tick стартует кампанию в указанное время.
                </p>
              </button>
            </div>

            {scheduleMode === "later" && (
              <div>
                <Label htmlFor="c-sched">Дата и время *</Label>
                <Input
                  id="c-sched"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-1"
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            )}

            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="font-medium text-gray-900">Сводка перед запуском:</div>
                <div className="grid grid-cols-2 gap-1 text-gray-700">
                  <span className="text-gray-500">Сегмент</span>
                  <span>{selectedSegment?.name ?? "—"}</span>
                  <span className="text-gray-500">Получателей</span>
                  <span>{selectedSegment?.contactCount.toLocaleString("ru-RU") ?? "—"}</span>
                  <span className="text-gray-500">Шаблон</span>
                  <span>{selectedTemplate?.name ?? "—"}</span>
                  <span className="text-gray-500">Тема</span>
                  <span className="truncate">{subject || "—"}</span>
                  <span className="text-gray-500">От</span>
                  <span>
                    {fromName} &lt;{fromEmail || "—"}&gt;
                  </span>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={STEPS.findIndex((s) => s.key === step) === 0}
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.key === step);
            setStep(STEPS[idx - 1].key);
          }}
        >
          Назад
        </Button>
        {step === "schedule" ? (
          <Button
            size="lg"
            disabled={!canProceed.schedule || createCampaignMutation.isPending || sendMutation.isPending}
            onClick={handleFinish}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {createCampaignMutation.isPending || sendMutation.isPending
              ? "Запускаем…"
              : scheduleMode === "now"
              ? "Запустить кампанию"
              : "Запланировать"}
          </Button>
        ) : (
          <Button
            disabled={!canProceed[step]}
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.key === step);
              setStep(STEPS[idx + 1].key);
            }}
          >
            Далее
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MarketingCampaignNewPage() {
  return (
    <Suspense fallback={<div className="container mx-auto max-w-5xl px-4 py-8 text-gray-500">Загрузка…</div>}>
      <NewCampaignContent />
    </Suspense>
  );
}
