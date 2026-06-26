"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  Trash2,
  Workflow,
  Clock,
  Mail,
  UserPlus,
  ShoppingCart,
  Moon,
  CheckCheck,
  GitBranch,
  LogOut,
} from "lucide-react";

const TRIGGERS = [
  {
    value: "user_registered",
    label: "Регистрация пользователя",
    description: "Запускается один раз при создании аккаунта",
    icon: UserPlus,
  },
  {
    value: "course_purchased",
    label: "Покупка курса",
    description: "Запускается при успешной оплате заказа",
    icon: ShoppingCart,
  },
  {
    value: "inactive_30d",
    label: "Неактивность",
    description: "Запускается когда пользователь не активен N дней (по умолчанию 30)",
    icon: Moon,
  },
  {
    value: "course_completed",
    label: "Завершение курса",
    description: "Запускается при 100% прохождении курса",
    icon: CheckCheck,
  },
];

export type AutomationStepUI =
  | { type?: "email"; delayHours: number; templateId: string; label?: string }
  | {
      type: "condition";
      metric: "opened" | "clicked";
      withinHours: number;
      skipStepsIfFalse: number;
      referenceStepIndex?: number;
      label?: string;
    }
  | {
      type: "exit_on_event";
      events: Array<"order.paid" | "email.unsubscribed" | "email.clicked" | "email.opened">;
      withinHoursSinceStart?: number;
      label?: string;
    };

export interface AutomationFormData {
  name: string;
  trigger: string;
  triggerData: Record<string, unknown>;
  steps: AutomationStepUI[];
}

interface AutomationEditorProps {
  initialData?: Partial<AutomationFormData>;
  submitLabel?: string;
  isSubmitting?: boolean;
  onSubmit: (data: AutomationFormData) => void;
}

interface TemplateOption {
  id: string;
  name: string;
  subject: string;
}

function getStepType(step: AutomationStepUI): "email" | "condition" | "exit_on_event" {
  if ((step as { type?: string }).type === "condition") return "condition";
  if ((step as { type?: string }).type === "exit_on_event") return "exit_on_event";
  return "email";
}

const ALL_EXIT_EVENTS = [
  { value: "order.paid" as const, label: "Купил курс" },
  { value: "email.unsubscribed" as const, label: "Отписался" },
  { value: "email.clicked" as const, label: "Кликнул в любом письме" },
  { value: "email.opened" as const, label: "Открыл любое письмо" },
];

export function AutomationEditor({
  initialData,
  submitLabel = "Сохранить",
  isSubmitting,
  onSubmit,
}: AutomationEditorProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [trigger, setTrigger] = useState(initialData?.trigger ?? "user_registered");
  const [inactiveDays, setInactiveDays] = useState<number>(
    (initialData?.triggerData?.days as number) ?? 30
  );
  const [steps, setSteps] = useState<AutomationStepUI[]>(
    initialData?.steps ?? [{ delayHours: 0, templateId: "", label: "" }]
  );

  const { data: templates } = useQuery({
    queryKey: ["marketing-templates-for-auto"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/templates");
      return r.data.data.items as TemplateOption[];
    },
  });

  function addEmailStep() {
    setSteps([...steps, { delayHours: 24, templateId: "", label: "" }]);
  }
  function addConditionStep() {
    setSteps([
      ...steps,
      { type: "condition", metric: "opened", withinHours: 24, skipStepsIfFalse: 1, label: "" },
    ]);
  }
  function addExitStep() {
    setSteps([
      ...steps,
      { type: "exit_on_event", events: ["order.paid"], label: "" },
    ]);
  }

  function updateStep(idx: number, patch: Partial<AutomationStepUI>) {
    setSteps((s) =>
      s.map((step, i) => (i === idx ? ({ ...step, ...patch } as AutomationStepUI) : step))
    );
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    const triggerData: Record<string, unknown> = {};
    if (trigger === "inactive_30d") triggerData.days = inactiveDays;
    onSubmit({ name: name.trim(), trigger, triggerData, steps });
  }

  const canSubmit =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => {
      const t = getStepType(s);
      if (t === "email") return (s as { templateId: string }).templateId.length > 0;
      if (t === "exit_on_event") return (s as { events: string[] }).events.length > 0;
      return true;
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Имя</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Welcome серия для новых студентов"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Триггер</CardTitle>
          <CardDescription>Когда запускать цепочку для пользователя.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TRIGGERS.map((t) => {
              const Icon = t.icon;
              const active = trigger === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTrigger(t.value)}
                  className={`text-left p-4 rounded-lg border transition-all ${
                    active
                      ? "border-pink-500 bg-pink-50 ring-2 ring-pink-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-pink-600" />
                    <span className="font-medium">{t.label}</span>
                  </div>
                  <p className="text-xs text-gray-600">{t.description}</p>
                </button>
              );
            })}
          </div>

          {trigger === "inactive_30d" && (
            <div className="pt-2">
              <Label className="text-xs text-gray-600">Порог неактивности (дней)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={inactiveDays}
                onChange={(e) => setInactiveDays(Number(e.target.value) || 30)}
                className="mt-1 max-w-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Шаги цепочки</CardTitle>
          <CardDescription>
            Email-шаг отправляет письмо. <strong>Условие</strong> проверяет открыл / кликнул
            прошлый шаг и пропускает следующие если нет. <strong>Выход</strong> завершает цепочку
            при событии (купил → стоп серии).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step, idx) => {
            const stepType = getStepType(step);
            return (
              <div key={idx}>
                <div
                  className={`border rounded-lg p-4 space-y-3 ${
                    stepType === "email"
                      ? "border-gray-200"
                      : stepType === "condition"
                        ? "border-amber-200 bg-amber-50/30"
                        : "border-rose-200 bg-rose-50/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          stepType === "email"
                            ? "bg-pink-100 text-pink-700"
                            : stepType === "condition"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <span className="text-sm font-medium">
                        Шаг {idx + 1} ·{" "}
                        {stepType === "email"
                          ? "Письмо"
                          : stepType === "condition"
                            ? "Условие"
                            : "Выход"}
                      </span>
                      {idx === 0 && stepType === "email" && (
                        <Badge variant="outline" className="text-xs">
                          первый — от триггера
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(idx)}
                      disabled={steps.length === 1}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {stepType === "email" && (
                    <EmailStepBody
                      step={step as Extract<AutomationStepUI, { type?: "email" }>}
                      templates={templates ?? []}
                      onChange={(patch) => updateStep(idx, patch)}
                    />
                  )}
                  {stepType === "condition" && (
                    <ConditionStepBody
                      step={step as Extract<AutomationStepUI, { type: "condition" }>}
                      idx={idx}
                      onChange={(patch) => updateStep(idx, patch)}
                    />
                  )}
                  {stepType === "exit_on_event" && (
                    <ExitStepBody
                      step={step as Extract<AutomationStepUI, { type: "exit_on_event" }>}
                      onChange={(patch) => updateStep(idx, patch)}
                    />
                  )}
                </div>

                {idx < steps.length - 1 && (
                  <div className="flex justify-center my-2">
                    <ArrowDown className="h-4 w-4 text-gray-300" />
                  </div>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t">
            <Button variant="outline" onClick={addEmailStep} className="gap-2">
              <Mail className="h-4 w-4" />
              + Письмо
            </Button>
            <Button variant="outline" onClick={addConditionStep} className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
              <GitBranch className="h-4 w-4" />
              + Условие
            </Button>
            <Button variant="outline" onClick={addExitStep} className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50">
              <LogOut className="h-4 w-4" />
              + Выход
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" disabled={!canSubmit || isSubmitting} onClick={handleSubmit} className="gap-2">
          <Workflow className="h-4 w-4" />
          {isSubmitting ? "Сохраняем…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function EmailStepBody({
  step,
  templates,
  onChange,
}: {
  step: Extract<AutomationStepUI, { type?: "email" }>;
  templates: TemplateOption[];
  onChange: (patch: Partial<AutomationStepUI>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[150px,1fr] gap-3">
        <div>
          <Label className="text-xs text-gray-600 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Задержка (часов)
          </Label>
          <Input
            type="number"
            min={0}
            max={8760}
            value={step.delayHours}
            onChange={(e) => onChange({ delayHours: Number(e.target.value) || 0 })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Шаблон
          </Label>
          <select
            value={step.templateId}
            onChange={(e) => onChange({ templateId: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— выберите шаблон —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-600">Подпись для админки (опц.)</Label>
        <Input
          value={step.label ?? ""}
          placeholder="День 1: приветствие"
          onChange={(e) => onChange({ label: e.target.value })}
          className="mt-1"
        />
      </div>
    </>
  );
}

function ConditionStepBody({
  step,
  idx,
  onChange,
}: {
  step: Extract<AutomationStepUI, { type: "condition" }>;
  idx: number;
  onChange: (patch: Partial<AutomationStepUI>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-900">
        Если получатель <strong>{step.metric === "opened" ? "открыл" : "кликнул"}</strong> прошлый
        шаг (#{step.referenceStepIndex ?? idx - 1 + 1}) за {step.withinHours} часов — идём дальше.
        Иначе — пропускаем {step.skipStepsIfFalse} {step.skipStepsIfFalse === 1 ? "шаг" : "шагов"}.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-gray-600">Метрика</Label>
          <div className="mt-1 flex gap-1">
            {(["opened", "clicked"] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={step.metric === m ? "default" : "outline"}
                onClick={() => onChange({ metric: m })}
              >
                {m === "opened" ? "Открыл" : "Кликнул"}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-600">Окно (часов)</Label>
          <Input
            type="number"
            min={1}
            max={8760}
            value={step.withinHours}
            onChange={(e) => onChange({ withinHours: Number(e.target.value) || 24 })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Пропустить шагов если НЕТ</Label>
          <Input
            type="number"
            min={0}
            max={99}
            value={step.skipStepsIfFalse}
            onChange={(e) => onChange({ skipStepsIfFalse: Number(e.target.value) || 0 })}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-600">Подпись для админки (опц.)</Label>
        <Input
          value={step.label ?? ""}
          placeholder="Открыл welcome? → дальше"
          onChange={(e) => onChange({ label: e.target.value })}
          className="mt-1"
        />
      </div>
    </div>
  );
}

function ExitStepBody({
  step,
  onChange,
}: {
  step: Extract<AutomationStepUI, { type: "exit_on_event" }>;
  onChange: (patch: Partial<AutomationStepUI>) => void;
}) {
  function toggle(evt: typeof ALL_EXIT_EVENTS[number]["value"]) {
    const next = step.events.includes(evt)
      ? step.events.filter((e) => e !== evt)
      : [...step.events, evt];
    onChange({ events: next });
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-rose-900">
        Завершает цепочку для пользователя если хотя бы одно событие произошло. Используется чтобы
        не дожимать тех кто уже купил/отписался.
      </p>
      <div className="space-y-1">
        {ALL_EXIT_EVENTS.map((e) => (
          <label key={e.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={step.events.includes(e.value)}
              onChange={() => toggle(e.value)}
            />
            {e.label}
          </label>
        ))}
      </div>
      <div>
        <Label className="text-xs text-gray-600">
          Окно проверки в часах от старта цепочки (опц., по умолчанию — с начала run&apos;а)
        </Label>
        <Input
          type="number"
          min={1}
          max={8760}
          value={step.withinHoursSinceStart ?? ""}
          onChange={(e) =>
            onChange({
              withinHoursSinceStart: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="например 168 (неделя)"
          className="mt-1"
        />
      </div>
    </div>
  );
}
