"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Wrench, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getCloudflareImageUrl, extractImageId } from "@/lib/cloudflare-images";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  isPublished: boolean;
  createdAt: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
    }>;
  }>;
}

export default function AdminCourseEditPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const { data: course, isLoading } = useQuery<CourseDetail>({
    queryKey: ["admin", "courses", courseId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/courses/${courseId}`);
      return response.data.data;
    },
  });

  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setDescription(course.description || "");
      setCoverImage(course.coverImage || "");
      setIsPublished(course.isPublished);
    }
  }, [course]);

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.patch(`/admin/courses/${courseId}`, {
        title,
        description,
        coverImage: coverImage ? extractImageId(coverImage) : null,
        isPublished,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      toast.success("Настройки курса обновлены");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || "Не удалось обновить курс";
      toast.error(message);
    },
  });

  if (isLoading || !course) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/courses">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Настройки курса</h1>
          </div>
          <p className="text-gray-600 ml-12">Управляйте основными параметрами и просматривайте структуру</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/courses/${courseId}/builder`}>
            <Wrench className="mr-2 h-4 w-4" />
            Конструктор
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600">Модулей</div>
            <div className="text-2xl font-bold text-gray-900">{course.modules.length}</div>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600">Уроков</div>
            <div className="text-2xl font-bold text-gray-900">{totalLessons}</div>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600">Статус</div>
            <div className="text-2xl font-bold text-gray-900">
              {isPublished ? (
                <span className="text-green-600 flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Опубликован
                </span>
              ) : (
                <span className="text-orange-600 flex items-center gap-2">
                  <EyeOff className="h-5 w-5" />
                  Черновик
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-2 border-b border-gray-200 bg-transparent mb-6">
          <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
            Настройки
          </TabsTrigger>
          <TabsTrigger value="curriculum" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
             Программа курса (Просмотр)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          {/* Main form */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Основная информация</CardTitle>
              <CardDescription className="text-gray-600">
                Настройте название, описание и обложку курса
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-gray-700">
                  Название курса
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите название курса"
                  className="border-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="text-gray-700">
                  Slug (URL)
                </Label>
                <Input
                  id="slug"
                  value={course.slug}
                  disabled
                  className="border-gray-300 bg-gray-50"
                />
                <p className="text-xs text-gray-500">
                  Slug генерируется автоматически при создании курса и не может быть изменен
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-700">
                  Описание
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Краткое описание курса"
                  rows={4}
                  className="border-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverImage" className="text-gray-700">
                  Обложка курса
                </Label>
                <Input
                  id="coverImage"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="Image ID или полный URL"
                  className="border-gray-300"
                />
                <p className="text-xs text-gray-500">
                  Введите Cloudflare Images ID (например: <code className="bg-gray-100 px-1 rounded">abc123</code>) или полный URL изображения
                </p>
                {coverImage && (
                  <div className="mt-2">
                    <img
                      src={getCloudflareImageUrl(coverImage)}
                      alt="Предпросмотр обложки"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="space-y-0.5">
                  <Label htmlFor="isPublished" className="text-gray-900">
                    Опубликовать курс
                  </Label>
                  <p className="text-sm text-gray-600">
                    Курс будет виден студентам в каталоге
                  </p>
                </div>
                <Switch
                  id="isPublished"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button
                  onClick={() => updateCourseMutation.mutate()}
                  disabled={updateCourseMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updateCourseMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/admin/courses")}
                  className="border-gray-300"
                >
                  Отменить
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Course info */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Информация о курсе</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ID курса:</span>
                <span className="font-mono text-gray-900">{course.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Дата создания:</span>
                <span className="text-gray-900">
                  {new Date(course.createdAt).toLocaleDateString("ru-RU", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Модулей:</span>
                <span className="text-gray-900">{course.modules.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Уроков:</span>
                <span className="text-gray-900">{totalLessons}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curriculum">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Программа курса</CardTitle>
              <CardDescription className="text-gray-600">
                Предпросмотр структуры курса, как ее видят студенты
              </CardDescription>
            </CardHeader>
            <CardContent>
               {course.modules.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">В курсе нет модулей</p>
                    <Button variant="outline" className="mt-4" asChild>
                         <Link href={`/admin/courses/${courseId}/builder`}>
                             Перейти в конструктор
                         </Link>
                    </Button>
                  </div>
               ) : (
                <Accordion type="single" collapsible className="w-full space-y-4">
                  {course.modules.map((module) => (
                    <AccordionItem key={module.id} value={module.id} className="border rounded-lg px-4 bg-white">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-gray-900 text-lg">{module.title}</span>
                          <span className="text-sm text-gray-500 font-normal">{module.lessons.length} уроков</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-4">
                        <div className="space-y-1">
                          {module.lessons.map((lesson, idx) => (
                            <div key={lesson.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50">
                               <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                                  {idx + 1}
                               </div>
                               <span className="text-gray-700 text-sm">{lesson.title}</span>
                               <Button variant="ghost" size="sm" asChild className="ml-auto h-8 w-8 p-0 text-gray-400 hover:text-blue-600">
                                   <Link href={`/admin/lessons/${lesson.id}/edit`}>
                                     <Wrench className="h-4 w-4" />
                                   </Link>
                               </Button>
                            </div>
                          ))}
                          {module.lessons.length === 0 && (
                            <p className="text-sm text-gray-400 pl-9">Нет уроков</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
               )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

