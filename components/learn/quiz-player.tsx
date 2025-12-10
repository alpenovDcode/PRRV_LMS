"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizQuestion {
  id: string | number;
  type?: "single_choice" | "multiple_choice" | "text" | "code";
  question?: string;
  text?: string; // Admin format
  options?: string[];
  points?: number;
}

interface QuizContent {
  questions: QuizQuestion[];
  totalPoints?: number;
}

interface QuizPlayerProps {
  lessonId: string;
  content: any;
}

interface QuizAttempt {
  id: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt?: string;
  score?: number;
  isPassed?: boolean;
  requiresReview?: boolean;
  answers: Record<string, any>;
}

interface QuizStatus {
  canStart: boolean;
  reason?: string;
  attemptsLeft?: number;
  nextAttemptAt?: string;
  activeAttempt?: QuizAttempt;
}

export function QuizPlayer({ lessonId, content }: QuizPlayerProps) {
  const queryClient = useQueryClient();
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const quizContent = content as QuizContent;
  const questions = quizContent?.questions || [];

  // Start quiz mutation
  const startQuizMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/lessons/${lessonId}/quiz`);
      return response.data.data;
    },
    onSuccess: (data) => {
      setActiveAttempt(data);
      setAnswers(data.answers || {});
      setCurrentQuestionIndex(0);
      queryClient.invalidateQueries({ queryKey: ["quiz-status", lessonId] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || "Не удалось начать квиз");
    },
  });

  // Fetch quiz status
  const { data: status, isLoading: statusLoading } = useQuery<QuizStatus>({
    queryKey: ["quiz-status", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/lessons/${lessonId}/quiz`);
      return response.data.data;
    },
  });

  // Auto-start or resume
  useEffect(() => {
    if (status) {
      if (status.activeAttempt) {
        // Resume existing attempt
        setActiveAttempt(status.activeAttempt);
        setAnswers(status.activeAttempt.answers || {});
      } else if (status.canStart && !activeAttempt && !startQuizMutation.isPending && !startQuizMutation.isSuccess) {
        // Auto-start new attempt
        startQuizMutation.mutate();
      }
    }
  }, [status]);

  // Submit quiz mutation
  const submitQuizMutation = useMutation({
    mutationFn: async () => {
      if (!activeAttempt) return;
      const response = await apiClient.patch(`/lessons/${lessonId}/quiz`, {
        attemptId: activeAttempt.id,
        answers,
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      setActiveAttempt((prev) => prev ? { ...prev, ...data, submittedAt: new Date().toISOString() } : null);
      toast.success("Ответы отправлены!");
      queryClient.invalidateQueries({ queryKey: ["quiz-status", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] }); // Update lesson progress
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || "Не удалось отправить ответы");
    },
  });

  // Timer effect
  useEffect(() => {
    if (activeAttempt && !activeAttempt.submittedAt && timeLeft !== null && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && activeAttempt && !activeAttempt.submittedAt) {
      submitQuizMutation.mutate();
    }
  }, [activeAttempt, timeLeft, submitQuizMutation]);

  const handleAnswer = (value: any) => {
    const question = questions[currentQuestionIndex];
    setAnswers((prev) => ({
      ...prev,
      [question.id]: value,
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      submitQuizMutation.mutate();
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  if (statusLoading && !activeAttempt) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Result view
  if (activeAttempt?.submittedAt) {
    return (
      <Card className="max-w-2xl mx-auto border-gray-200">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            {activeAttempt.isPassed ? (
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            ) : activeAttempt.requiresReview ? (
              <Clock className="h-10 w-10 text-blue-600" />
            ) : (
              <XCircle className="h-10 w-10 text-red-600" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {activeAttempt.isPassed
              ? "Поздравляем! Вы сдали тест"
              : activeAttempt.requiresReview
              ? "Отправлено на проверку"
              : "Тест не сдан"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <p className="text-gray-500">Результат</p>
              <p className="text-2xl font-bold text-gray-900">{activeAttempt.score}%</p>
            </div>
          </div>
          
          <p className="text-gray-600">
            {activeAttempt.isPassed
              ? "Отличная работа! Вы можете переходить к следующему уроку."
              : activeAttempt.requiresReview
              ? "Куратор проверит ваши ответы в ближайшее время."
              : "Попробуйте еще раз, чтобы закрепить материал."}
          </p>

          {!activeAttempt.isPassed && !activeAttempt.requiresReview && status?.canStart && (
            <Button 
              onClick={() => {
                setActiveAttempt(null);
                startQuizMutation.mutate();
              }}
              className="mt-4"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Попробовать снова
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Active quiz view
  if (activeAttempt) {
    const question = questions[currentQuestionIndex];
    if (!question) return <div>Ошибка: вопрос не найден</div>;

    const currentAnswer = answers[question.id];
    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    const questionText = question.question || question.text || "Текст вопроса отсутствует";
    const questionType = question.type || "single_choice";

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Вопрос {currentQuestionIndex + 1} из {questions.length}</span>
          {timeLeft !== null && (
            <span className="flex items-center text-orange-600 font-medium">
              <Clock className="mr-1 h-4 w-4" />
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>

        <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} className="h-2" />

        <Card className="border-gray-200">
          <CardContent className="p-6 space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">{questionText}</h3>

            <div className="space-y-4">
              {questionType === "single_choice" && question.options && (
                <RadioGroup
                  value={currentAnswer as string}
                  onValueChange={handleAnswer}
                  className="space-y-3"
                >
                  {question.options.map((option, idx) => (
                    <div key={idx} className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      <RadioGroupItem value={option} id={`opt-${idx}`} />
                      <Label htmlFor={`opt-${idx}`} className="flex-1 cursor-pointer font-normal text-base">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {questionType === "multiple_choice" && question.options && (
                <div className="space-y-3">
                  {question.options.map((option, idx) => {
                    const selected = (currentAnswer as string[]) || [];
                    return (
                      <div key={idx} className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                        <Checkbox
                          id={`opt-${idx}`}
                          checked={selected.includes(option)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleAnswer([...selected, option]);
                            } else {
                              handleAnswer(selected.filter((s) => s !== option));
                            }
                          }}
                        />
                        <Label htmlFor={`opt-${idx}`} className="flex-1 cursor-pointer font-normal text-base">
                          {option}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}

              {(questionType === "text" || questionType === "code") && (
                <Textarea
                  value={currentAnswer as string || ""}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder="Введите ваш ответ..."
                  rows={6}
                  className="resize-none"
                />
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between p-6 bg-gray-50 rounded-b-lg">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentQuestionIndex === 0}
            >
              Назад
            </Button>
            <Button
              onClick={handleNext}
              disabled={!currentAnswer || (Array.isArray(currentAnswer) && currentAnswer.length === 0)}
              className={cn(
                isLastQuestion ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700",
                "text-white"
              )}
            >
              {isLastQuestion ? (submitQuizMutation.isPending ? "Отправка..." : "Завершить") : "Далее"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Loading state if auto-starting
  return (
    <div className="flex justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      <span className="ml-2 text-gray-500">Загрузка теста...</span>
    </div>
  );
}
