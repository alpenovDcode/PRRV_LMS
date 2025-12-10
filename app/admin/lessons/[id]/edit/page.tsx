"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, FileText, Video, HelpCircle, Plus, Trash2, GripVertical } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";

interface LessonDetail {
  id: string;
  title: string;
  type: "video" | "text" | "quiz";
  content: any;
  videoId: string | null;
  videoDuration: number | null;
  thumbnailUrl: string | null;
  isFree: boolean;
  isStopLesson: boolean;
  dripRule: any;
  settings: any;
  module: {
    id: string;
    title: string;
    course: {
      id: string;
      title: string;
      slug: string;
    };
  };
}

export default function LessonEditorPage() {
  const params = useParams();
  const lessonId = params.id as string;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("content");

  // Форма
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"video" | "text" | "quiz">("video");
  const [content, setContent] = useState<any>(null);
  const [videoId, setVideoId] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [isStopLesson, setIsStopLesson] = useState(false);
  const [dripRule, setDripRule] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [homeworkDeadline, setHomeworkDeadline] = useState("");

  const { data: lesson, isLoading } = useQuery<LessonDetail>({
    queryKey: ["admin", "lesson", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/lessons/${lessonId}`);
      return response.data.data;
    },
  });

  // Заполняем форму данными урока после загрузки
  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      // Для quiz типа убеждаемся, что content имеет правильную структуру
      if (lesson.type === "quiz") {
        if (lesson.content && typeof lesson.content === "object" && lesson.content.questions) {
          setContent(lesson.content);
        } else if (lesson.content && typeof lesson.content === "string") {
          try {
            const parsed = JSON.parse(lesson.content);
            setContent(parsed);
          } catch {
            setContent({ questions: [] });
          }
        } else {
          setContent({ questions: [] });
        }
      } else {
        setContent(lesson.content);
      }
      setVideoId(lesson.videoId || "");
      setVideoDuration(lesson.videoDuration?.toString() || "");
      setThumbnailUrl(lesson.thumbnailUrl || "");
      setIsFree(lesson.isFree);
      setIsStopLesson(lesson.isStopLesson);
      setDripRule(lesson.dripRule);
      setSettings(lesson.settings || {});
      setHomeworkDeadline(
        lesson.settings?.homeworkDeadline
          ? new Date(lesson.settings.homeworkDeadline).toISOString().slice(0, 16)
          : ""
      );
    }
  }, [lesson]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiClient.patch(`/admin/lessons/${lessonId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "lesson", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      toast.success("Урок успешно обновлен");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || "Не удалось обновить урок";
      toast.error(message);
    },
  });

  const handleSave = () => {
    // Валидация для quiz типа
    if (type === "quiz") {
      if (!content || !content.questions || !Array.isArray(content.questions)) {
        toast.error("Тест должен содержать хотя бы один вопрос");
        return;
      }

      // Проверяем каждый вопрос
      for (let i = 0; i < content.questions.length; i++) {
        const question = content.questions[i];
        if (!question.text || question.text.trim() === "") {
          toast.error(`Вопрос ${i + 1}: текст вопроса не может быть пустым`);
          return;
        }
        if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
          toast.error(`Вопрос ${i + 1}: должно быть минимум 2 варианта ответа`);
          return;
        }
        // Проверяем, что все варианты заполнены
        for (let j = 0; j < question.options.length; j++) {
          if (!question.options[j] || question.options[j].trim() === "") {
            toast.error(`Вопрос ${i + 1}, вариант ${j + 1}: текст варианта не может быть пустым`);
            return;
          }
        }
        // Проверяем, что выбран правильный ответ
        if (
          question.correct === undefined ||
          question.correct === null ||
          question.correct < 0 ||
          question.correct >= question.options.length
        ) {
          toast.error(`Вопрос ${i + 1}: необходимо выбрать правильный ответ`);
          return;
        }
      }
    }

    const updateData: any = {
      title,
      type,
      content,
      videoId: videoId || null,
      videoDuration: videoDuration ? parseInt(videoDuration) : null,
      thumbnailUrl: thumbnailUrl || null,
      isFree,
      isStopLesson,
      dripRule,
      settings: {
        ...settings,
        homeworkDeadline: homeworkDeadline ? new Date(homeworkDeadline).toISOString() : undefined,
      },
    };

    updateMutation.mutate(updateData);
  };

  const handleContentChange = (field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (isLoading || !lesson) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="border-gray-300">
            <Link href={`/admin/courses/${lesson.module.course.id}/builder`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <span>{lesson.module.course.title}</span>
              <span>•</span>
              <span>{lesson.module.title}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Редактор урока</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="border-gray-300"
          >
            <Save className="mr-2 h-4 w-4" />
            Сохранить изменения
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 border-b border-gray-200 bg-transparent">
          <TabsTrigger value="basic" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
            Основное
          </TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
            Содержание
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
            Настройки
          </TabsTrigger>
          <TabsTrigger value="preview" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
            Просмотр
          </TabsTrigger>
        </TabsList>

        {/* Основное */}
        <TabsContent value="basic" className="mt-6 space-y-6">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Основная информация</CardTitle>
              <CardDescription className="text-gray-600">
                Название, тип и базовые параметры урока
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-gray-700">Название урока</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Введение в курс"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type" className="text-gray-700">Тип урока</Label>
                <Select value={type} onValueChange={(v) => setType(v as "video" | "text" | "quiz")}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Видео
                      </div>
                    </SelectItem>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Текст
                      </div>
                    </SelectItem>
                    <SelectItem value="quiz">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Тест
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isFree"
                  checked={isFree}
                  onCheckedChange={(checked) => setIsFree(Boolean(checked))}
                />
                <Label htmlFor="isFree" className="text-gray-700 cursor-pointer">
                  Бесплатный урок (доступен без зачисления)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isStopLesson"
                  checked={isStopLesson}
                  onCheckedChange={(checked) => setIsStopLesson(Boolean(checked))}
                />
                <Label htmlFor="isStopLesson" className="text-gray-700 cursor-pointer">
                  Стоп-урок (следующий урок откроется только после принятия ДЗ)
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Содержание */}
        <TabsContent value="content" className="mt-6 space-y-6">
          {type === "video" && (
            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900">Видео</CardTitle>
                <CardDescription className="text-gray-600">
                  Настройки видеоконтента урока
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="videoId" className="text-gray-700">
                    Cloudflare Stream Video ID
                  </Label>
                  <Input
                    id="videoId"
                    value={videoId}
                    onChange={(e) => setVideoId(e.target.value)}
                    placeholder="Введите Video ID из Cloudflare Stream"
                    className="border-gray-300 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    ID видео из Cloudflare Stream. Видео должно быть загружено заранее.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="videoDuration" className="text-gray-700">
                    Длительность (секунды)
                  </Label>
                  <Input
                    id="videoDuration"
                    type="number"
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(e.target.value)}
                    placeholder="3600"
                    className="border-gray-300 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="thumbnailUrl" className="text-gray-700">
                    URL превью
                  </Label>
                  <Input
                    id="thumbnailUrl"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://..."
                    className="border-gray-300 focus:border-blue-500"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {type === "text" && (
            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900">Текстовое содержание</CardTitle>
                <CardDescription className="text-gray-600">
                  Редактируйте текстовый контент урока в формате Markdown
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="markdown" className="text-gray-700">
                    Markdown контент
                  </Label>
                  <Textarea
                    id="markdown"
                    value={content?.markdown || ""}
                    onChange={(e) => handleContentChange("markdown", e.target.value)}
                    placeholder="# Заголовок урока

Текст урока..."
                    rows={20}
                    className="border-gray-300 focus:border-blue-500 font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-700">
                    Описание урока
                  </Label>
                  <Textarea
                    id="description"
                    value={content?.description || ""}
                    onChange={(e) => handleContentChange("description", e.target.value)}
                    placeholder="Краткое описание урока"
                    rows={4}
                    className="border-gray-300 focus:border-blue-500"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {type === "quiz" && (
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-gray-900">Тест</CardTitle>
                    <CardDescription className="text-gray-600">
                      Создайте интерактивный тест с вопросами и вариантами ответов
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      const currentQuestions = content?.questions || [];
                      const newQuestion = {
                        id: currentQuestions.length + 1,
                        text: "",
                        options: ["", ""],
                        correct: 0,
                      };
                      setContent({
                        ...content,
                        questions: [...currentQuestions, newQuestion],
                      });
                    }}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить вопрос
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {(!content?.questions || content.questions.length === 0) ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">Тест пока не содержит вопросов</p>
                    <Button
                      type="button"
                      onClick={() => {
                        setContent({
                          questions: [
                            {
                              id: 1,
                              text: "",
                              options: ["", ""],
                              correct: 0,
                            },
                          ],
                        });
                      }}
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Создать первый вопрос
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {content.questions.map((question: any, questionIndex: number) => (
                      <Card key={question.id || questionIndex} className="border-gray-200 bg-gray-50">
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2 text-gray-500">
                              <GripVertical className="h-5 w-5" />
                              <span className="text-sm font-medium">Вопрос {questionIndex + 1}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newQuestions = content.questions.filter(
                                  (_: any, idx: number) => idx !== questionIndex
                                );
                                setContent({ ...content, questions: newQuestions });
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700">Текст вопроса *</Label>
                            <Textarea
                              value={question.text || ""}
                              onChange={(e) => {
                                const newQuestions = [...content.questions];
                                newQuestions[questionIndex] = {
                                  ...newQuestions[questionIndex],
                                  text: e.target.value,
                                };
                                setContent({ ...content, questions: newQuestions });
                              }}
                              placeholder="Введите текст вопроса..."
                              rows={2}
                              className="border-gray-300 focus:border-blue-500"
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-gray-700">Варианты ответов *</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newQuestions = [...content.questions];
                                  newQuestions[questionIndex] = {
                                    ...newQuestions[questionIndex],
                                    options: [...(newQuestions[questionIndex].options || []), ""],
                                  };
                                  setContent({ ...content, questions: newQuestions });
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Добавить вариант
                              </Button>
                            </div>

                            {question.options?.map((option: string, optionIndex: number) => (
                              <div key={optionIndex} className="flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="radio"
                                    name={`correct-${questionIndex}`}
                                    checked={question.correct === optionIndex}
                                    onChange={() => {
                                      const newQuestions = [...content.questions];
                                      newQuestions[questionIndex] = {
                                        ...newQuestions[questionIndex],
                                        correct: optionIndex,
                                      };
                                      setContent({ ...content, questions: newQuestions });
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                  />
                                  <Input
                                    value={option}
                                    onChange={(e) => {
                                      const newQuestions = [...content.questions];
                                      const newOptions = [...newQuestions[questionIndex].options];
                                      newOptions[optionIndex] = e.target.value;
                                      newQuestions[questionIndex] = {
                                        ...newQuestions[questionIndex],
                                        options: newOptions,
                                      };
                                      setContent({ ...content, questions: newQuestions });
                                    }}
                                    placeholder={`Вариант ${optionIndex + 1}`}
                                    className="border-gray-300 focus:border-blue-500"
                                  />
                                </div>
                                {question.options.length > 2 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newQuestions = [...content.questions];
                                      const newOptions = newQuestions[questionIndex].options.filter(
                                        (_: string, idx: number) => idx !== optionIndex
                                      );
                                      // Если удаляем правильный ответ, сбрасываем выбор
                                      let newCorrect = newQuestions[questionIndex].correct;
                                      if (newCorrect === optionIndex) {
                                        newCorrect = 0;
                                      } else if (newCorrect > optionIndex) {
                                        newCorrect = newCorrect - 1;
                                      }
                                      newQuestions[questionIndex] = {
                                        ...newQuestions[questionIndex],
                                        options: newOptions,
                                        correct: newCorrect,
                                      };
                                      setContent({ ...content, questions: newQuestions });
                                    }}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          {question.correct !== undefined && question.correct !== null && (
                            <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                              <span className="font-medium">Правильный ответ:</span>{" "}
                              {question.options?.[question.correct] || "Не выбран"}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Дополнительное содержание</CardTitle>
              <CardDescription className="text-gray-600">
                Что вы узнаете, материалы для скачивания и т.д.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="whatYoullLearn" className="text-gray-700">
                  Что вы узнаете (по одному на строку)
                </Label>
                <Textarea
                  id="whatYoullLearn"
                  value={
                    content?.whatYoullLearn
                      ? (Array.isArray(content.whatYoullLearn)
                          ? content.whatYoullLearn.join("\n")
                          : content.whatYoullLearn)
                      : ""
                  }
                  onChange={(e) =>
                    handleContentChange(
                      "whatYoullLearn",
                      e.target.value.split("\n").filter((line) => line.trim())
                    )
                  }
                  placeholder="Пункт 1&#10;Пункт 2&#10;Пункт 3"
                  rows={6}
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="homework" className="text-gray-700">
                  Текст домашнего задания
                </Label>
                <Textarea
                  id="homework"
                  value={content?.homework || ""}
                  onChange={(e) => handleContentChange("homework", e.target.value)}
                  placeholder="Опишите задание для студентов..."
                  rows={6}
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Настройки */}
        <TabsContent value="settings" className="mt-6 space-y-6">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Расписание (Drip Content)</CardTitle>
              <CardDescription className="text-gray-600">
                Настройте, когда урок станет доступен студентам
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700">Тип открытия</Label>
                <Select
                  value={
                    dripRule?.type === "after_start"
                      ? "after_start"
                      : dripRule?.type === "on_date"
                        ? "on_date"
                        : dripRule?.type === "after_previous_completed"
                          ? "after_previous_completed"
                          : "immediately"
                  }
                  onValueChange={(value) => {
                    if (value === "immediately") {
                      setDripRule(null);
                    } else if (value === "after_start") {
                      setDripRule({ ...dripRule, type: "after_start", days: dripRule?.days || 0 });
                    } else if (value === "on_date") {
                      setDripRule({ ...dripRule, type: "on_date", date: dripRule?.date || new Date().toISOString() });
                    } else if (value === "after_previous_completed") {
                      setDripRule({ ...dripRule, type: "after_previous_completed", delayHours: dripRule?.delayHours || 0 });
                    }
                  }}
                >
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediately">Сразу после старта</SelectItem>
                    <SelectItem value="after_start">Через N дней после старта</SelectItem>
                    <SelectItem value="on_date">В определенную дату</SelectItem>
                    <SelectItem value="after_previous_completed">После завершения предыдущего</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dripRule?.type === "after_start" && (
                <div className="space-y-2">
                  <Label htmlFor="dripDays" className="text-gray-700">
                    Количество дней
                  </Label>
                  <Input
                    id="dripDays"
                    type="number"
                    value={dripRule.days || 0}
                    onChange={(e) =>
                      setDripRule({ ...dripRule, days: parseInt(e.target.value) || 0 })
                    }
                    className="border-gray-300 focus:border-blue-500"
                  />
                </div>
              )}

              {dripRule?.type === "on_date" && (
                <div className="space-y-2">
                  <Label htmlFor="dripDate" className="text-gray-700">
                    Дата открытия
                  </Label>
                  <Input
                    id="dripDate"
                    type="datetime-local"
                    value={
                      dripRule.date
                        ? new Date(dripRule.date).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setDripRule({ ...dripRule, date: new Date(e.target.value).toISOString() })
                    }
                    className="border-gray-300 focus:border-blue-500"
                  />
                </div>
              )}

              {dripRule?.type === "after_previous_completed" && (
                <div className="space-y-2">
                  <Label htmlFor="dripDelayHours" className="text-gray-700">
                    Задержка (в часах)
                  </Label>
                  <Input
                    id="dripDelayHours"
                    type="number"
                    value={dripRule.delayHours || 0}
                    onChange={(e) =>
                      setDripRule({ ...dripRule, delayHours: parseInt(e.target.value) || 0 })
                    }
                    className="border-gray-300 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    Через сколько часов урок откроется после выполнения предыдущего урока.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div className="space-y-2">
                  <Label htmlFor="softDeadline" className="text-gray-700">
                    Мягкий дедлайн
                  </Label>
                  <Input
                    id="softDeadline"
                    type="datetime-local"
                    value={
                      dripRule?.softDeadline
                        ? new Date(dripRule.softDeadline).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                      setDripRule({ ...dripRule, softDeadline: val });
                    }}
                    className="border-gray-300 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    После этой даты задание будет помечено как &quot;Сдано с опозданием&quot;.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hardDeadline" className="text-gray-700">
                    Жесткий дедлайн
                  </Label>
                  <Input
                    id="hardDeadline"
                    type="datetime-local"
                    value={
                      dripRule?.hardDeadline
                        ? new Date(dripRule.hardDeadline).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                      setDripRule({ ...dripRule, hardDeadline: val });
                    }}
                    className="border-gray-300 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    После этой даты отправка заданий будет заблокирована.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Домашнее задание</CardTitle>
              <CardDescription className="text-gray-600">
                Настройки дедлайна для домашнего задания
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="homeworkDeadline" className="text-gray-700">
                  Дедлайн для ДЗ
                </Label>
                <Input
                  id="homeworkDeadline"
                  type="datetime-local"
                  value={homeworkDeadline}
                  onChange={(e) => setHomeworkDeadline(e.target.value)}
                  className="border-gray-300 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">
                  Оставьте пустым, если дедлайна нет. Дедлайн будет показан студентам в дашборде.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Просмотр */}
        <TabsContent value="preview" className="mt-6">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Предпросмотр урока</CardTitle>
              <CardDescription className="text-gray-600">
                Как урок будет выглядеть для студентов
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">{title || "Название урока"}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Тип: {type === "video" ? "Видео" : type === "text" ? "Текст" : "Тест"}</span>
                  {isFree && (
                    <>
                      <span>•</span>
                      <span className="text-green-600">Бесплатный</span>
                    </>
                  )}
                  {isStopLesson && (
                    <>
                      <span>•</span>
                      <span className="text-orange-600">Стоп-урок</span>
                    </>
                  )}
                </div>
              </div>

              {type === "video" && videoId && (
                <div className="bg-gray-100 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Видео:</p>
                  <p className="font-mono text-sm">Video ID: {videoId}</p>
                  {videoDuration && (
                    <p className="text-sm text-gray-600 mt-1">
                      Длительность: {Math.floor(parseInt(videoDuration) / 60)}:{(parseInt(videoDuration) % 60).toString().padStart(2, "0")}
                    </p>
                  )}
                </div>
              )}

              {type === "text" && content?.markdown && (
                <div className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm">{content.markdown}</pre>
                </div>
              )}

              {content?.description && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Описание:</p>
                  <p className="text-sm text-gray-600">{content.description}</p>
                </div>
              )}

              {content?.whatYoullLearn && Array.isArray(content.whatYoullLearn) && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Что вы узнаете:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {content.whatYoullLearn.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {content?.homework && (
                <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                  <p className="text-sm font-medium text-blue-900 mb-2">Домашнее задание:</p>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{content.homework}</p>
                </div>
              )}

              {dripRule && (
                <div className="border border-gray-200 rounded-lg p-4 bg-yellow-50">
                  <p className="text-sm font-medium text-yellow-900 mb-2">Расписание:</p>
                  <p className="text-sm text-yellow-800">
                    {dripRule.type === "after_start"
                      ? `Откроется через ${dripRule.days} дней после старта курса`
                      : dripRule.type === "on_date"
                        ? `Откроется ${new Date(dripRule.date).toLocaleDateString("ru-RU")}`
                        : "Сразу после старта"}
                  </p>
                </div>
              )}

              {homeworkDeadline && (
                <div className="border border-gray-200 rounded-lg p-4 bg-red-50">
                  <p className="text-sm font-medium text-red-900 mb-2">Дедлайн ДЗ:</p>
                  <p className="text-sm text-red-800">
                    {new Date(homeworkDeadline).toLocaleString("ru-RU")}
                  </p>
                </div>
              )}

              {type === "quiz" && content?.questions && content.questions.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 bg-purple-50">
                  <p className="text-sm font-medium text-purple-900 mb-4">
                    Тест ({content.questions.length} вопросов):
                  </p>
                  <div className="space-y-4">
                    {content.questions.map((question: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border border-purple-200">
                        <p className="text-sm font-medium text-gray-900 mb-2">
                          {idx + 1}. {question.text || "Без текста"}
                        </p>
                        <div className="space-y-2">
                          {question.options?.map((option: string, optIdx: number) => (
                            <div
                              key={optIdx}
                              className={`text-sm p-2 rounded ${
                                question.correct === optIdx
                                  ? "bg-green-100 text-green-800 border border-green-300"
                                  : "bg-gray-50 text-gray-700"
                              }`}
                            >
                              {optIdx + 1}. {option}
                              {question.correct === optIdx && (
                                <span className="ml-2 text-xs font-medium">✓ Правильный ответ</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

