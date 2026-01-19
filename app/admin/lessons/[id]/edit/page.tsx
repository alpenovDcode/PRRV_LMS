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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, FileText, Video, HelpCircle, Plus, Trash2, GripVertical, Image, Check, ChevronsUpDown, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";
import { LessonContentPlayer } from "@/components/learn/lesson-content-player";

interface LessonDetail {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "track_definition";
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
  const [type, setType] = useState<"video" | "text" | "quiz" | "track_definition">("video");
  const [content, setContent] = useState<any>(null);
  // Video state
  const [videos, setVideos] = useState<Array<{ videoId: string; title?: string; duration: number }>>([]);
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([]);
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

  const { data: videoLibrary } = useQuery({
    queryKey: ["admin", "video-library"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/video-library");
      return response.data.data;
    },
  });

  // Заполняем форму данными урока после загрузки
  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      
      // Content handling
      let lessonContent = lesson.content;
      if (lesson.type === "quiz") {
        if (lessonContent && typeof lessonContent === "object" && lessonContent.questions) {
          // ok
        } else if (lessonContent && typeof lessonContent === "string") {
          try {
            lessonContent = JSON.parse(lessonContent);
          } catch {
            lessonContent = { questions: [] };
          }
        } else {
          lessonContent = { questions: [] };
        }
      } else {
        setContent(lessonContent);
      }

      // Video handling
      if (lesson.content?.videos && Array.isArray(lesson.content.videos)) {
        setVideos(lesson.content.videos);
      } else if (lesson.videoId) {
        // Migration/Fallback: create single video entry from legacy columns
        setVideos([{
          videoId: lesson.videoId,
          duration: lesson.videoDuration || 0,
          title: "Основное видео"
        }]);
      } else {
        setVideos([]);
      }

      // Links handling
      if (lesson.content?.links && Array.isArray(lesson.content.links)) {
        setLinks(lesson.content.links);
      } else {
        setLinks([]);
      }

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

    // Prepare content with videos and links
    const updatedContent = { ...content };
    if (type === "video") {
      updatedContent.videos = videos;
    }
    updatedContent.links = links;

    // Legacy columns sync (take first video)
    const mainVideo = videos.length > 0 ? videos[0] : null;

    const updateData: any = {
      title,
      type,
      content: updatedContent,
      videoId: mainVideo?.videoId || null,
      videoDuration: mainVideo?.duration || null,
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
                    <SelectItem value="track_definition">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        Определение трека
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
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700">Список видео</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVideos([...videos, { videoId: "", duration: 0, title: "" }]);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить видео
                    </Button>
                  </div>

                  {videos.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                      <Video className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Нет добавленных видео</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {videos.map((video, index) => (
                        <Card key={index} className="bg-gray-50 border-gray-200">
                          <CardContent className="p-4 space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="h-6 w-6 flex items-center justify-center rounded-full p-0">
                                  {index + 1}
                                </Badge>
                                <span className="font-medium text-sm text-gray-700">Видео {index + 1}</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newVideos = videos.filter((_, i) => i !== index);
                                  setVideos(newVideos);
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2 flex flex-col">
                                <Label className="text-xs text-gray-600">Найти видео</Label>
                                <Popover
                                  open={openComboboxIndex === index}
                                  onOpenChange={(open) => {
                                    setOpenComboboxIndex(open ? index : null);
                                    if(open) setSearchTerm("");
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={openComboboxIndex === index}
                                      className="justify-between bg-white font-normal text-left h-auto min-h-[40px]"
                                    >
                                      <span className="truncate">
                                        {video.title || (video.videoId ? `ID: ${video.videoId.slice(0, 8)}...` : "Выберите видео...")}
                                      </span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[300px] p-0" align="start">
                                    <div className="flex flex-col">
                                      <div className="flex items-center border-b px-3">
                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                        <Input
                                          placeholder="Поиск видео..."
                                          value={searchTerm}
                                          onChange={(e) => setSearchTerm(e.target.value)}
                                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9"
                                        />
                                      </div>
                                      <div className="max-h-[300px] overflow-y-auto p-1">
                                        {videoLibrary && videoLibrary.length > 0 ? (
                                          videoLibrary
                                            .filter((v: any) => {
                                              if (!searchTerm) return true;
                                              return v.title.toLowerCase().includes(searchTerm.toLowerCase());
                                            })
                                            .map((v: any) => (
                                              <div
                                                key={v.id}
                                                onClick={() => {
                                                  const newVideos = [...videos];
                                                  newVideos[index] = {
                                                      ...video,
                                                      videoId: v.cloudflareId,
                                                      title: v.title,
                                                      duration: v.duration || 0,
                                                  };
                                                  setVideos(newVideos);
                                                  setOpenComboboxIndex(null);
                                                }}
                                                className={cn(
                                                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                                  video.videoId === v.cloudflareId && "bg-accent"
                                                )}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4",
                                                    video.videoId === v.cloudflareId ? "opacity-100" : "opacity-0"
                                                  )}
                                                />
                                                <span className="truncate">{v.title}</span>
                                              </div>
                                            ))
                                        ) : (
                                          <div className="py-6 text-center text-sm text-gray-500">
                                            Нет доступных видео
                                          </div>
                                        )}
                                        {videoLibrary && videoLibrary.filter((v: any) => v.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                           <div className="py-6 text-center text-sm text-gray-500">
                                             Видео не найдено
                                           </div>
                                        )}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">Название (опционально)</Label>
                                <Input
                                  value={video.title || ""}
                                  onChange={(e) => {
                                    const newVideos = [...videos];
                                    newVideos[index] = { ...video, title: e.target.value };
                                    setVideos(newVideos);
                                  }}
                                  placeholder="Название видео"
                                  className="bg-white"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">Длительность (сек)</Label>
                                <Input
                                  type="number"
                                  value={video.duration || ""}
                                  onChange={(e) => {
                                    const newVideos = [...videos];
                                    newVideos[index] = { ...video, duration: parseInt(e.target.value) || 0 };
                                    setVideos(newVideos);
                                  }}
                                  placeholder="0"
                                  className="bg-white"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
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

                {/* Cloudflare Image Insert Helper */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Вставить изображение из Cloudflare
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="imageId" className="text-xs text-gray-700">
                        ID изображения из Cloudflare Images
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="imageId"
                          placeholder="Например: abc123-def456-ghi789"
                          className="bg-white font-mono text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const imageId = (e.target as HTMLInputElement).value.trim();
                              if (imageId) {
                                const textarea = document.getElementById('markdown') as HTMLTextAreaElement;
                                if (textarea) {
                                  const start = textarea.selectionStart;
                                  const end = textarea.selectionEnd;
                                  const currentValue = content?.markdown || "";
                                  const imageMarkdown = `\n\n![Описание изображения](cloudflare:${imageId})\n\n`;
                                  const newValue = currentValue.substring(0, start) + imageMarkdown + currentValue.substring(end);
                                  handleContentChange("markdown", newValue);
                                  toast.success("Изображение вставлено!");
                                  (e.target as HTMLInputElement).value = "";
                                  // Set cursor position after inserted image
                                  setTimeout(() => {
                                    textarea.focus();
                                    textarea.setSelectionRange(start + imageMarkdown.length, start + imageMarkdown.length);
                                  }, 0);
                                }
                              }
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const input = document.getElementById('imageId') as HTMLInputElement;
                            const imageId = input?.value.trim();
                            if (!imageId) {
                              toast.error("Введите ID изображения");
                              return;
                            }
                            const textarea = document.getElementById('markdown') as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const currentValue = content?.markdown || "";
                              
                              // Ensure we have newlines before and after for proper markdown parsing
                              const before = currentValue.substring(0, start);
                              const after = currentValue.substring(end);
                              
                              // Add newlines if not at start/end and previous char is not newline
                              const needsNewlineBefore = start > 0 && !before.endsWith('\n');
                              const needsNewlineAfter = end < currentValue.length && !after.startsWith('\n');
                              
                              const imageMarkdown = `${needsNewlineBefore ? '\n\n' : ''}![Описание изображения](cloudflare:${imageId})${needsNewlineAfter ? '\n\n' : ''}`;
                              const newValue = before + imageMarkdown + after;
                              
                              handleContentChange("markdown", newValue);
                              toast.success("Изображение вставлено!");
                              if (input) input.value = "";
                              
                              // Set cursor position after inserted image
                              setTimeout(() => {
                                textarea.focus();
                                const newPosition = start + imageMarkdown.length;
                                textarea.setSelectionRange(newPosition, newPosition);
                              }, 0);
                            }
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Вставить
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1 bg-white p-3 rounded border border-blue-100">
                      <p className="font-medium">Синтаксис:</p>
                      <code className="block bg-gray-100 p-2 rounded font-mono text-xs">
                        ![Описание](cloudflare:IMAGE_ID)
                      </code>
                      <p className="text-gray-500 mt-2">
                        Изображение будет автоматически загружено из Cloudflare Images при отображении урока студентам.
                      </p>
                    </div>
                  </CardContent>
                </Card>

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

          {type === "track_definition" && (
            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle className="text-gray-900">Определение трека</CardTitle>
                <CardDescription className="text-gray-600">
                  Этот тип урока использует стандартный опросник для определения трека студента.
                  Вопросы зашиты в системе и не требуют настройки здесь.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200">
                  <p className="font-medium">Как это работает?</p>
                  <p className="text-sm mt-1">
                    Студенту будет предложено 5 вопросов о его опыте и целях. 
                    На основе ответов система автоматически определит рекомендованный трек (1-5) 
                    и установит его в профиле студента.
                  </p>
                  <p className="text-sm mt-2">
                    В случае спорного результата (равенство баллов), студенту будет предложено связаться с куратором.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Кнопки и ссылки</CardTitle>
              <CardDescription className="text-gray-600">
                Добавьте кнопки с ссылками, которые будут отображаться под видео
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-700">Список ссылок</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLinks([...links, { label: "", url: "" }]);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить кнопку
                  </Button>
                </div>

                {links.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-500">Нет добавленных кнопок</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {links.map((link, index) => (
                      <Card key={index} className="bg-gray-50 border-gray-200">
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="h-6 w-6 flex items-center justify-center rounded-full p-0">
                                {index + 1}
                              </Badge>
                              <span className="font-medium text-sm text-gray-700">Кнопка {index + 1}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newLinks = links.filter((_, i) => i !== index);
                                setLinks(newLinks);
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-600">Текст кнопки</Label>
                              <Input
                                value={link.label}
                                onChange={(e) => {
                                  const newLinks = [...links];
                                  newLinks[index] = { ...link, label: e.target.value };
                                  setLinks(newLinks);
                                }}
                                placeholder="Например: Скачать материалы"
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-gray-600">Ссылка (URL)</Label>
                              <Input
                                value={link.url}
                                onChange={(e) => {
                                  const newLinks = [...links];
                                  newLinks[index] = { ...link, url: e.target.value };
                                  setLinks(newLinks);
                                }}
                                placeholder="https://..."
                                className="bg-white"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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

              {type === "video" && videos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Видео ({videos.length}):</p>
                  {videos.map((video, idx) => (
                    <div key={idx} className="bg-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                         <span className="font-medium text-sm">Видео {idx + 1}</span>
                         {video.title && <span className="text-xs text-gray-500">{video.title}</span>}
                      </div>
                      <p className="font-mono text-sm mb-1">ID: {video.videoId || "Не указан"}</p>
                      {video.duration > 0 && (
                        <p className="text-sm text-gray-600">
                          Длительность: {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, "0")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {type === "text" && content?.markdown && (
                <div className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-4">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      img: ({ node, src, alt, ...props }) => {
                        // Check if image uses Cloudflare Images syntax
                        if (src?.startsWith('cloudflare:')) {
                          const imageId = src.replace('cloudflare:', '');
                          const imageUrl = getCloudflareImageUrl(imageId);
                          return (
                            <img
                              src={imageUrl}
                              alt={alt || 'Изображение урока'}
                              className="rounded-lg my-4 max-w-full h-auto"
                              loading="lazy"
                              {...props}
                            />
                          );
                        }
                        // Regular image
                        return <img src={src} alt={alt} className="rounded-lg my-4 max-w-full h-auto" loading="lazy" {...props} />;
                      },
                    }}
                  >
                    {content.markdown}
                  </ReactMarkdown>
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

