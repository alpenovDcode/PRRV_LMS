"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Play,
  FileText,
  MessageSquare,
  Upload,
  X,
  Menu,
  Star,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { QuizPlayer } from "@/components/learn/quiz-player";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: any;
  videoId: string | null;
  videoDuration: number | null;
  thumbnailUrl: string | null;
  isStopLesson: boolean;
  isAvailable: boolean;
  availableDate?: string;
  progress?: {
    status: string;
    watchedTime: number;
    rating?: number;
  } | null;
}

interface CourseNav {
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      orderIndex: number;
      isAvailable: boolean;
      progress?: { status: string };
    }>;
  }>;
  currentLessonId: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

interface HomeworkSubmission {
  id: string;
  status: string;
  content: string | null;
  files: string[];
  curatorComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function LessonPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const lessonId = params.lessonId as string;
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [watchedTime, setWatchedTime] = useState(0);
  const [isAutoNextScheduled, setIsAutoNextScheduled] = useState(false);
  const [homeworkContent, setHomeworkContent] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("details");
  const [hoverRating, setHoverRating] = useState(0);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Reset active video when lesson changes
  useEffect(() => {
    setActiveVideoIndex(0);
  }, [lessonId]);

  const { data: lesson, isLoading: lessonLoading } = useQuery<Lesson>({
    queryKey: ["lesson", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/lessons/${lessonId}`);
      return response.data.data;
    },
  });

  const { data: courseNav } = useQuery<CourseNav>({
    queryKey: ["course-nav", slug, lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/courses/${slug}/navigation?lessonId=${lessonId}`);
      return response.data.data;
    },
  });

  const { data: homework, isLoading: homeworkLoading } = useQuery<HomeworkSubmission | null>({
    queryKey: ["homework", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/lessons/${lessonId}/homework`);
      return response.data.data;
    },
    enabled: !!lesson,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: { watchedTime: number; status?: string; rating?: number }) => {
      await apiClient.post(`/lessons/${lessonId}/progress`, data);
    },
  });

  const submitHomeworkMutation = useMutation({
    mutationFn: async (data: { content: string; files?: string[] }) => {
      const response = await apiClient.post(`/lessons/${lessonId}/homework`, data);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success("Домашнее задание отправлено на проверку");
      queryClient.invalidateQueries({ queryKey: ["homework", lessonId] });
      setHomeworkContent("");
      setUploadedFiles([]);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || "Не удалось отправить задание";
      toast.error(message);
    },
  });

  // Восстановление позиции видео
  useEffect(() => {
    if (lesson?.progress?.watchedTime && videoRef.current && lesson.type === "video") {
      videoRef.current.currentTime = lesson.progress.watchedTime;
      setWatchedTime(lesson.progress.watchedTime);
    }
  }, [lesson]);

  // Авто-сохранение прогресса и авто-переход
  useEffect(() => {
    const videos = lesson?.content?.videos || (lesson?.videoId ? [{ videoId: lesson.videoId, duration: lesson.videoDuration || 0 }] : []);
    const activeVideo = videos[activeVideoIndex];

    if (lesson?.type === "video" && videoRef.current && activeVideo) {
      const video = videoRef.current;

      const handleTimeUpdate = () => {
        const currentTime = Math.floor(video.currentTime);
        setWatchedTime(currentTime);

        // Auto-save progress every 10 seconds
        if (currentTime % 10 === 0) {
          updateProgressMutation.mutate({
            watchedTime: currentTime,
            status: activeVideo.duration && currentTime / activeVideo.duration > 0.9 ? "completed" : "in_progress",
          });
        }

        // Mark as completed at 90%
        if (
          activeVideo.duration &&
          currentTime / activeVideo.duration >= 0.9 &&
          lesson.progress?.status !== "completed"
        ) {
          updateProgressMutation.mutate({
            watchedTime: currentTime,
            status: "completed",
          });
          queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
        }

        // Авто-переход на следующий урок через 5 секунд после окончания
        // Только если это последнее видео в плейлисте или если урок уже помечен как завершенный
        const isLastVideo = activeVideoIndex === videos.length - 1;
        
        if (
          activeVideo.duration &&
          currentTime >= activeVideo.duration - 1 &&
          !isAutoNextScheduled &&
          courseNav?.nextLessonId &&
          (isLastVideo || lesson.progress?.status === "completed")
        ) {
          setIsAutoNextScheduled(true);
          setTimeout(() => {
            if (courseNav.nextLessonId) {
              router.push(`/learn/${slug}/${courseNav.nextLessonId}`);
            }
          }, 5000);
        }
      };

      const handleEnded = () => {
        updateProgressMutation.mutate({
          watchedTime: activeVideo.duration || 0,
          status: "completed",
        });
        queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
        
        // Auto-advance to next video in playlist if available
        if (activeVideoIndex < videos.length - 1) {
           setActiveVideoIndex(prev => prev + 1);
        }
      };

      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("ended", handleEnded);

      return () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("ended", handleEnded);
      };
    }
  }, [lesson, lessonId, courseNav, router, slug, isAutoNextScheduled, queryClient, updateProgressMutation, activeVideoIndex]);

  // Загрузка файлов
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      setUploadedFiles((prev) => [...prev, data.url]);
      toast.success(`Файл ${data.name} загружен`);
    },
    onError: () => {
      toast.error("Ошибка при загрузке файла");
    },
  });

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      uploadFileMutation.mutate(file);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      for (const file of files) {
        uploadFileMutation.mutate(file);
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleSubmitHomework = () => {
    if (!homeworkContent.trim()) {
      toast.error("Введите ответ на задание");
      return;
    }
    submitHomeworkMutation.mutate({
      content: homeworkContent,
      files: uploadedFiles,
    });
  };

  if (lessonLoading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-500">Загрузка урока...</div>
        </div>
      </div>
    );
  }

  if (!lesson || !lesson.isAvailable) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Card className="max-w-md border-gray-200">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <Lock className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Урок недоступен</h3>
              <p className="text-sm text-gray-600">
                {lesson?.availableDate
                  ? `Этот урок откроется ${new Date(lesson.availableDate).toLocaleDateString("ru-RU")}`
                  : "Этот урок еще не открыт для вас. Продолжайте обучение по порядку."}
              </p>
              <Button asChild variant="outline" className="border-gray-300">
                <Link href={`/courses/${slug}`}>Вернуться к курсу</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const watchedPercent = lesson.videoDuration && lesson.videoDuration > 0
    ? Math.round((watchedTime / lesson.videoDuration) * 100)
    : 0;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar navigation (Desktop & Mobile) */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 transform bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:block overflow-y-auto",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <Button variant="ghost" asChild className="justify-start text-gray-700 hover:bg-gray-50 px-2">
            <Link href={`/courses/${slug}`}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              К курсу
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {courseNav && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Прогресс курса</h3>
              <Progress value={45} className="h-2" />
              <p className="text-xs text-gray-500 mt-1">45% завершено</p>
            </div>
            <Accordion type="multiple" className="w-full" defaultValue={courseNav.modules.map(m => m.id)}>
              {courseNav.modules.map((module) => (
                <AccordionItem key={module.id} value={module.id} className="border-gray-200">
                  <AccordionTrigger className="text-sm font-medium text-gray-900 hover:no-underline py-2">
                    {module.title}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      {module.lessons.map((l) => {
                        const isCurrent = l.id === lessonId;
                        const isCompleted = l.progress?.status === "completed";
                        return (
                          <Link
                            key={l.id}
                            href={l.isAvailable ? `/learn/${slug}/${l.id}` : "#"}
                            className={cn(
                              "flex items-center gap-2 rounded-md p-2 text-sm transition-colors",
                              isCurrent
                                ? "bg-blue-50 text-blue-600 font-medium"
                                : l.isAvailable
                                  ? "hover:bg-gray-50 text-gray-700"
                                  : "opacity-50 cursor-not-allowed text-gray-400"
                            )}
                            onClick={(e) => {
                              if (!l.isAvailable) e.preventDefault();
                              setMobileMenuOpen(false);
                            }}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <Play className="h-4 w-4 flex-shrink-0" />
                            )}
                            <span className="flex-1 truncate">{l.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Video/Content area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="container mx-auto px-4 py-6 max-w-5xl">
            {/* Breadcrumbs & Mobile Menu Trigger */}
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden -ml-2 mr-1 h-8 w-8"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Link href={`/courses/${slug}`} className="hover:text-blue-600 hidden sm:block">
                {courseNav?.modules[0]?.title || "Курс"}
              </Link>
              <ChevronRight className="h-4 w-4 hidden sm:block" />
              <span className="text-gray-900 font-medium truncate flex-1">{lesson.title}</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">{lesson.title}</h1>

            {/* Video Player */}
            {lesson.type === "video" && (
              <div className="space-y-4 mb-6">
                {(() => {
                  const videos = lesson.content?.videos || (lesson.videoId ? [{ videoId: lesson.videoId, duration: lesson.videoDuration || 0, title: "Основное видео" }] : []);
                  const activeVideo = videos[activeVideoIndex];

                  if (!activeVideo || !activeVideo.videoId) return null;

                  return (
                    <>
                      <Card className="border-gray-200 shadow-sm overflow-hidden">
                        <CardContent className="p-0">
                          <div className="relative aspect-video bg-black">
                            {/* Cloudflare Stream Player */}
                            <iframe
                              src={`https://${process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${activeVideo.videoId}/iframe?preload=true&poster=https%3A%2F%2F${process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com%2F${activeVideo.videoId}%2Fthumbnails%2Fthumbnail.jpg`}
                              className="w-full aspect-video"
                              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                              allowFullScreen
                            ></iframe>
                            <video
                              ref={videoRef}
                              className="hidden"
                              controls
                              src={`https://${process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${activeVideo.videoId}/manifest/video.m3u8`}
                            />
                          </div>
                          {activeVideo.duration > 0 && (
                            <div className="p-4 bg-gray-50 border-t border-gray-200">
                              <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-gray-600">Прогресс просмотра</span>
                                <span className="font-semibold text-gray-900">
                                  {formatTime(watchedTime)} / {formatTime(activeVideo.duration)}
                                </span>
                              </div>
                              <Progress 
                                value={Math.round((watchedTime / activeVideo.duration) * 100)} 
                                className="h-2" 
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Playlist */}
                      {videos.length > 1 && (
                        <Card className="border-gray-200">
                          <CardContent className="p-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Плейлист урока</h3>
                            <div className="space-y-2">
                              {videos.map((video: any, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => setActiveVideoIndex(idx)}
                                  className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                                    idx === activeVideoIndex
                                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                      : "hover:bg-gray-50 text-gray-700"
                                  )}
                                >
                                  <div className={cn(
                                    "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium",
                                    idx === activeVideoIndex
                                      ? "bg-blue-200 text-blue-700"
                                      : "bg-gray-100 text-gray-500"
                                  )}>
                                    {idx === activeVideoIndex ? <Play className="h-3 w-3 fill-current" /> : idx + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {video.title || `Видео ${idx + 1}`}
                                    </p>
                                    {video.duration > 0 && (
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {formatTime(video.duration)}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {lesson.type === "text" && (
              <Card className="mb-6 border-gray-200">
                <CardContent className="prose prose-sm max-w-none dark:prose-invert p-6">
                  {lesson.content?.markdown ? (
                    <ReactMarkdown>{lesson.content.markdown}</ReactMarkdown>
                  ) : (
                    <p className="text-gray-500">Контент урока</p>
                  )}
                </CardContent>
              </Card>
            )}

            {lesson.type === "quiz" && (
              <QuizPlayer lessonId={lessonId} content={lesson.content} />
            )}

            {lesson.type !== "video" && lesson.type !== "text" && lesson.type !== "quiz" && (
              <Card className="mb-6 border-gray-200">
                <CardContent className="p-6">
                  <p className="text-gray-500">Тип урока не поддерживается: {lesson.type}</p>
                </CardContent>
              </Card>
            )}

            {/* Links/Buttons */}
            {lesson.content?.links && Array.isArray(lesson.content.links) && lesson.content.links.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                {lesson.content.links.map((link: any, idx: number) => (
                  <Button
                    key={idx}
                    asChild
                    variant="outline"
                    className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  >
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.label}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 border-b border-gray-200 bg-transparent">
                <TabsTrigger value="details" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                  <FileText className="mr-2 h-4 w-4" />
                  Описание урока
                </TabsTrigger>
                <TabsTrigger value="homework" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Задание
                </TabsTrigger>
                <TabsTrigger value="discussion" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Обсуждение
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-6">
                <Card className="border-gray-200">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">О чем этот урок</h3>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                            <button
                              key={star}
                              type="button"
                              disabled={!!lesson.progress?.rating}
                              className={cn(
                                "transition-all",
                                lesson.progress?.rating 
                                  ? "cursor-not-allowed opacity-75" 
                                  : "cursor-pointer hover:scale-110"
                              )}
                              onMouseEnter={() => !lesson.progress?.rating && setHoverRating(star)}
                              onMouseLeave={() => !lesson.progress?.rating && setHoverRating(0)}
                              onClick={() => {
                                if (lesson.progress?.rating) return;
                                updateProgressMutation.mutate({
                                  watchedTime: watchedTime,
                                  status: lesson.progress?.status,
                                  rating: star,
                                });
                                toast.success("Спасибо за оценку!");
                              }}
                            >
                              <Star
                                className={cn(
                                  "h-5 w-5 transition-colors",
                                  (hoverRating || lesson.progress?.rating || 0) >= star
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                )}
                              />
                            </button>
                          ))}
                          <span className={cn(
                            "ml-2 text-sm",
                            lesson.progress?.rating 
                              ? "text-gray-700 font-medium" 
                              : "text-gray-500"
                          )}>
                            {lesson.progress?.rating 
                              ? `Ваша оценка: ${lesson.progress.rating}/10` 
                              : "Оцените урок"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {lesson.content?.description ? (
                      <div className="prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown>{lesson.content.description}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-gray-500">Описание урока отсутствует</p>
                    )}
                    
                    {lesson.content?.whatYoullLearn && (
                      <div className="mt-6">
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Что вы узнаете:</h4>
                        <ul className="space-y-2">
                          {(lesson.content.whatYoullLearn as string[]).map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="homework" className="mt-6">
                <Card className="border-gray-200">
                  <CardContent className="p-6">
                    {homeworkLoading ? (
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-32 bg-gray-200 rounded" />
                      </div>
                    ) : homework ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">Ваше задание</h3>
                          <Badge
                            variant={
                              homework.status === "approved"
                                ? "default"
                                : homework.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className={
                              homework.status === "approved"
                                ? "bg-green-600"
                                : homework.status === "rejected"
                                  ? "bg-red-600"
                                  : "bg-amber-500"
                            }
                          >
                            {homework.status === "approved"
                              ? "Принято"
                              : homework.status === "rejected"
                                ? "Требует доработки"
                                : "На проверке"}
                          </Badge>
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{homework.content}</p>
                        </div>

                        {homework.files && homework.files.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Прикрепленные файлы:</h4>
                            <div className="space-y-2">
                              {homework.files.map((file, idx) => {
                                const fileName = file.split('/').pop() || file;
                                return (
                                  <a
                                    key={idx}
                                    href={file}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                  >
                                    <FileText className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm text-gray-700 truncate flex-1">{fileName}</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {homework.curatorComment && (
                          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-900 mb-2">Комментарий куратора:</h4>
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">{homework.curatorComment}</p>
                          </div>
                        )}

                        {homework.status === "rejected" && (
                          <Button
                            onClick={() => {
                              setActiveTab("homework");
                              setHomeworkContent(homework.content || "");
                            }}
                            variant="outline"
                            className="border-gray-300"
                          >
                            Отправить исправленную версию
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">Домашнее задание</h3>
                          <p className="text-sm text-gray-600">
                            {lesson.content?.homework || "Выполните задание и отправьте ответ ниже"}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="homework-content" className="text-gray-700">
                            Ваш ответ
                          </Label>
                          <Textarea
                            id="homework-content"
                            value={homeworkContent}
                            onChange={(e) => setHomeworkContent(e.target.value)}
                            placeholder="Введите ваш ответ на задание..."
                            rows={8}
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        {/* File upload area */}
                        <div className="space-y-2">
                          <Label className="text-gray-700">Прикрепленные файлы</Label>
                          <div
                            onDrop={handleFileDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors"
                          >
                            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600 mb-2">
                              Перетащите файлы сюда или
                            </p>
                            <label htmlFor="homework-file-input" className="cursor-pointer inline-block">
                              <input
                                id="homework-file-input"
                                type="file"
                                multiple
                                onChange={handleFileInput}
                                className="hidden"
                              />
                              <span className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
                                Выбрать файлы
                              </span>
                            </label>
                            <p className="text-xs text-gray-500 mt-2">
                              Поддерживаются: .html, .css, .zip, .pdf
                            </p>
                          </div>

                          {uploadedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {uploadedFiles.map((fileUrl, idx) => {
                                const fileName = fileUrl.split("/").pop() || "file";
                                return (
                                  <Badge key={idx} variant="outline" className="border-gray-300 gap-1 pr-1">
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                      {fileName}
                                    </a>
                                    <button
                                      onClick={() => removeFile(idx)}
                                      className="ml-1 hover:text-red-600 p-0.5 rounded-full hover:bg-red-50 transition-colors"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={handleSubmitHomework}
                          disabled={submitHomeworkMutation.isPending || !homeworkContent.trim()}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {submitHomeworkMutation.isPending ? "Отправка..." : "Отправить на проверку"}
                        </Button>

                        {lesson.isStopLesson && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm text-yellow-800">
                              <strong>Важно:</strong> Это стоп-урок. Следующий урок откроется только после того, как куратор примет ваше задание.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="discussion" className="mt-6">
                <Card className="border-gray-200">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Обсуждение и вопросы</h3>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Задайте вопрос или поделитесь мыслями..."
                        rows={4}
                        className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Отправить комментарий
                      </Button>
                    </div>
                    <div className="mt-6 space-y-4">
                      <p className="text-sm text-gray-500 text-center py-8">
                        Пока нет комментариев. Будьте первым!
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Navigation footer */}
        <div className="border-t border-gray-200 bg-white p-4 shadow-sm">
          <div className="container mx-auto max-w-5xl flex items-center justify-between">
            <Button
              variant="outline"
              disabled={!courseNav?.prevLessonId}
              asChild={!!courseNav?.prevLessonId}
              className="border-gray-300"
            >
              {courseNav?.prevLessonId ? (
                <Link href={`/learn/${slug}/${courseNav.prevLessonId}`}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Предыдущий урок
                </Link>
              ) : (
                <>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Предыдущий урок
                </>
              )}
            </Button>

            {lesson.progress?.status === "completed" ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Урок завершен
              </div>
            ) : (
              <Button
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                onClick={() => {
                  updateProgressMutation.mutate({
                    watchedTime: watchedTime || 0,
                    status: "completed",
                  });
                  // Invalidate queries to update navigation state
                  queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
                  queryClient.invalidateQueries({ queryKey: ["course-nav", slug] });
                  toast.success("Урок отмечен как просмотренный");
                }}
                disabled={updateProgressMutation.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Просмотрел
              </Button>
            )}

            <Button
              disabled={!courseNav?.nextLessonId}
              asChild={!!courseNav?.nextLessonId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {courseNav?.nextLessonId ? (
                <Link href={`/learn/${slug}/${courseNav.nextLessonId}`}>
                  Следующий урок
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              ) : (
                <>
                  Следующий урок
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
