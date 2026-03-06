"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  text: string;
  type: "text" | "radio" | "scale";
  options?: string[];
  required?: boolean;
}

const QUESTIONS: Question[] = [
  {
    id: "telegram_nick",
    text: "Напишите свой ник в Telegram",
    type: "text",
    required: true,
  },
  {
    id: "curator",
    text: "Кто является вашим куратором?",
    type: "radio",
    options: ["Настя @kurator_Nastya03", "Рената @kurator_Renata"],
    required: true,
  },
  {
    id: "satisfaction_program",
    text: "Насколько вы в целом удовлетворены обучением на программе «Прорыв» на данный момент? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_expectations",
    text: "Насколько обучение оправдывает ваши ожидания, с которыми вы пришли на курс? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_results",
    text: "Насколько вы довольны своими результатами к этому моменту? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_quality",
    text: "Насколько вы удовлетворены качеством и содержанием уроков программы? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_hw_format",
    text: "Насколько удобным и понятным вам кажется формат домашних заданий? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_logic",
    text: "Насколько вы удовлетворены логикой и последовательностью материалов в программе?",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_calls",
    text: "Насколько полезными для вас являются еженедельные звонки с наставниками по модулям обучения? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_hw_check",
    text: "Оцените скорость и качество проверки домашних заданий от 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_curator_work",
    text: "Насколько вы довольны работой вашего куратора (поддержка, ответы, обратная связь)? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_platform",
    text: "Насколько вам удобно пользоваться учебной платформой (доступ к материалам, навигация, интерфейс)? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "satisfaction_bot",
    text: "Насколько вам удобно пользоваться ботом с полезной информацией? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "motivation",
    text: "Насколько вы чувствуете мотивацию продолжать обучение на данный момент? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "comfort",
    text: "Насколько вам комфортно эмоционально проходить обучение (нагрузка, темп, атмосфера)? От 0 до 10",
    type: "scale",
    required: true,
  },
  {
    id: "recommend",
    text: 'Насколько вы готовы порекомендовать "Прорыв" знакомым уже сейчас? От 0 до 10',
    type: "scale",
    required: true,
  },
];

interface IntermediateSurveyViewerProps {
  lessonId: string;
  isCompleted?: boolean;
  isPreview?: boolean;
}

export function IntermediateSurveyViewer({ lessonId, isCompleted, isPreview = false }: IntermediateSurveyViewerProps) {
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (payload: { content: string }) => {
      if (isPreview) {
        // Mock result
        await new Promise(r => setTimeout(r, 1000));
        return { success: true };
      }
      const response = await apiClient.post(`/lessons/${lessonId}/homework`, payload);
      return response.data;
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
      toast.success("Анкета отправлена");
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.message || "Ошибка при отправке анкеты";
      toast.error(msg);
    },
  });

  const handleSubmit = () => {
    // Check required
    const missing = QUESTIONS.filter(q => q.required && (answers[q.id] === undefined || answers[q.id] === ''));
    if (missing.length > 0) {
      toast.error("Пожалуйста, ответьте на все обязательные вопросы со звездочкой");
      return;
    }

    // Format for HomeworkContentRenderer (use _answers object convention or nice keys)
    const formattedAnswers: Record<string, string> = {};
    QUESTIONS.forEach(q => {
        formattedAnswers[q.text] = String(answers[q.id]);
    });

    submitMutation.mutate({ 
      content: JSON.stringify({ _answers: formattedAnswers }) 
    });
  };

  if (submitted || isCompleted) {
    return (
      <Card className="max-w-3xl mx-auto border-blue-100 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <CircleCheck className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Опрос пройден!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 pt-4 p-4 sm:p-6">
          <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200">
            <p className="text-gray-600">Спасибо за ваши ответы! Ваше мнение очень важно для нас.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12 px-2 sm:px-0">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Пройдите опрос, чтобы помочь нам сделать обучение лучше и качественнее
        </h2>
      </div>

      <div className="bg-gray-50/50 rounded-2xl p-6 sm:p-8 space-y-8 border border-gray-100 shadow-sm">
        {QUESTIONS.map((q) => (
          <div key={q.id} className="space-y-3">
            <Label className="text-base font-medium text-gray-900 leading-snug block">
              {q.text} {q.required && <span className="text-red-500">*</span>}
            </Label>

            {q.type === "text" && (
              <Input
                value={(answers[q.id] as string) || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                className="bg-white max-w-md border-gray-300"
              />
            )}

            {q.type === "radio" && q.options && (
              <RadioGroup
                value={(answers[q.id] as string) || ""}
                onValueChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                className="flex flex-col sm:flex-row gap-4 sm:gap-8 pt-1"
              >
                {q.options.map((option) => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`q-${q.id}-${option}`} className="text-blue-600" />
                    <Label htmlFor={`q-${q.id}-${option}`} className="font-normal text-gray-700 cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {q.type === "scale" && (
              <RadioGroup
                value={answers[q.id] !== undefined ? String(answers[q.id]) : ""}
                onValueChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: parseInt(val) }))}
                className="flex flex-wrap gap-x-4 gap-y-3 pt-1"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <div key={num} className="flex flex-row items-center space-x-2">
                    <RadioGroupItem value={String(num)} id={`q-${q.id}-${num}`} className="text-blue-600" />
                    <Label htmlFor={`q-${q.id}-${num}`} className="font-normal text-gray-700 cursor-pointer">
                      {num}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>
        ))}

        <div className="flex justify-center pt-8">
          <Button 
            size="lg" 
            onClick={handleSubmit} 
            disabled={submitMutation.isPending}
            className="bg-[#f05a28] hover:bg-[#d94a1d] text-white min-w-[240px] h-12 text-base rounded-full"
          >
            {submitMutation.isPending ? "Отправка..." : "Отправить анкету"}
          </Button>
        </div>
      </div>
    </div>
  );
}
