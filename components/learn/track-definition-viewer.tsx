"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Question {
  id: number;
  text: string;
  options: {
    value: number; // 1-5, corresponding to track
    label: string;
  }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: "Как лучше всего описать ваш текущий опыт преподавания?",
    options: [
      { value: 1, label: "Я почти не преподавал(а) или давно делал(а) большой перерыв" },
      { value: 2, label: "Я учитель с офлайн-опытом, но с компьютером и онлайн-форматами на «Вы»" },
      { value: 3, label: "Я действующий репетитор, но у меня мало учеников" },
      { value: 4, label: "Я действующий репетитор, есть ученики, но я все равно мало зарабатываю из-за низкого чека" },
      { value: 5, label: "У меня забито расписание, хочу перейти на группы и освободить время без потери дохода" },
    ],
  },
  {
    id: 2,
    text: "Какая задача для вас сейчас наиболее актуальна?",
    options: [
      { value: 1, label: "Научиться проводить занятия и найти первых учеников" },
      { value: 2, label: "Освоить инструменты работы онлайн (Zoom, онлайн-доски и т.д), почувствовать себя на «ты» с компьютером" },
      { value: 3, label: "Заполнить расписание как можно скорее" },
      { value: 4, label: "Найти учеников, готовых платить больше" },
      { value: 5, label: "Сократить часы за счёт групповых занятий" },
    ],
  },
  {
    id: 3,
    text: "Как вы оцениваете свои навыки работы с онлайн-инструментами?",
    options: [
      { value: 1, label: "Низкая, я новичок в преподавании и в технике" },
      { value: 2, label: "Трудно пользоваться современными онлайн-инструментами" },
      { value: 3, label: "Уверенный пользователь, но больше занят(а) поиском учеников" },
      { value: 4, label: "С компьютером проблем нет, главная задача – деньги и чек" },
      { value: 5, label: "Очень уверенно, хочу масштабироваться" },
    ],
  },
  {
    id: 4,
    text: "Как выглядит ваше текущее расписание?",
    options: [
      { value: 1, label: "Ученики отсутствуют" },
      { value: 2, label: "Есть офлайн-ученики, онлайн мало или нет" },
      { value: 3, label: "Есть пара учеников, но расписание пустое" },
      { value: 4, label: "Учеников достаточно, но доход низкий" },
      { value: 5, label: "Расписание перегружено, хочу разгрузиться, но не потерять в доходе" },
    ],
  },
  {
    id: 5,
    text: "Какой результат для вас сейчас в приоритете?",
    options: [
      { value: 1, label: "Начать проводить первые занятия с учениками и почувствовать уверенность" },
      { value: 2, label: "Уверенно пользоваться онлайн-инструментами и вести занятия через современные сервисы" },
      { value: 3, label: "Заполнить расписание учениками" },
      { value: 4, label: "Увеличить доход за счёт повышения стоимости занятий" },
      { value: 5, label: "Перейти на групповые форматы/пары, сократить часы и при этом сохранить/увеличить доход" },
    ],
  },
];

interface TrackDefinitionViewerProps {
  lessonId: string;
  isCompleted?: boolean;
  isPreview?: boolean;
}

export function TrackDefinitionViewer({ lessonId, isCompleted, isPreview = false }: TrackDefinitionViewerProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ track: string | number | null; message: string } | null>(null);
  const queryClient = useQueryClient();

  // Если урок уже пройден, можно было бы показывать результат, 
  // но API пока не возвращает сохраненные ответы для этого типа. 
  // Для простоты покажем заглушку, если урок пройден (или можно дать пройти заново, если нужно).

  const submitMutation = useMutation({
    mutationFn: async (payload: { answers: number[] }) => {
      if (isPreview) {
        // Mock result
        await new Promise(r => setTimeout(r, 1000));
        return { track: "PRO", message: "Ваш рекомендованный трек: PRO (Preview Mode)" };
      }
      const response = await apiClient.post(`/lessons/${lessonId}/track-submit`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
      toast.success("Ответы сохранены");
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.message || "Ошибка при отправке ответов";
      toast.error(msg);
    },
  });

  const handleSubmit = () => {
    // Проверка, что все вопросы отвечены
    if (Object.keys(answers).length < QUESTIONS.length) {
      toast.error("Пожалуйста, ответьте на все вопросы");
      return;
    }

    const answersArray = QUESTIONS.map((q) => answers[q.id]);
    submitMutation.mutate({ answers: answersArray });
  };

  if (result || isCompleted) {
    return (
      <Card className="max-w-3xl mx-auto border-blue-100 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Тест завершен!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 pt-4 p-4 sm:p-6">
          <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200">
            {result ? (
               <>
                 <h3 className="text-lg font-medium text-gray-900 mb-2">
                   {result.message}
                 </h3>
               </>
            ) : (
               <p className="text-gray-600">Вы уже прошли этот тест. Ваш трек должен быть обновлен в профиле.</p>
            )}
          </div>
          {/* <Button variant="outline" onClick={() => window.location.reload()}>Пройти заново (Debug)</Button> */}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 pb-12 px-2 sm:px-0">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Определение вашего трека</h2>
        <p className="text-sm sm:text-base text-gray-500">
          Ответьте на 5 вопросов, чтобы мы могли подобрать для вас оптимальную программу обучения
        </p>
      </div>

      <div className="space-y-6">
        {QUESTIONS.map((q, index) => (
          <Card key={q.id} className="border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3 sm:py-4 px-4 sm:px-6">
              <CardTitle className="text-base font-medium flex gap-3 text-gray-900">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm">
                  {index + 1}
                </span>
                {q.text}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
              <RadioGroup
                value={answers[q.id]?.toString()}
                onValueChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: parseInt(val) }))}
                className="space-y-3"
              >
                {q.options.map((option) => (
                  <div
                    key={option.value}
                    className={cn(
                      "flex items-start sm:items-center space-x-3 space-y-0 rounded-md border p-3 sm:p-4 cursor-pointer transition-colors",
                      answers[q.id] === option.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                  >
                    <RadioGroupItem value={option.value.toString()} id={`q${q.id}-${option.value}`} />
                    <Label
                      htmlFor={`q${q.id}-${option.value}`}
                      className="flex-1 cursor-pointer font-normal text-gray-700"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <Button 
          size="lg" 
          onClick={handleSubmit} 
          disabled={submitMutation.isPending}
          className="min-w-[200px]"
        >
          {submitMutation.isPending ? "Обработка..." : "Узнать свой трек"}
        </Button>
      </div>
    </div>
  );
}
