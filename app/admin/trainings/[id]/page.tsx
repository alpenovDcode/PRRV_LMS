"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  ChevronRight,
  CircleAlert,
  BarChart,
  CornerDownRight,
  ArrowLeft,
  FileText,
  PlayCircle,
  HelpCircle,
  Layout,
  Eye,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";

// Helper to structure flat modules into hierarchy
function structureModules(modules: any[]) {
  const modulesMap = new Map();
  const rootModules: any[] = [];

  // Clone to avoid mutations if re-rendering
  const processedModules = modules.map(m => ({ ...m, children: [] }));

  // Initialize details
  processedModules.forEach((module) => {
    modulesMap.set(module.id, module);
  });

  // Build hierarchy
  processedModules.forEach((module) => {
    if (module.parentId) {
      const parent = modulesMap.get(module.parentId);
      if (parent) {
        parent.children.push(module);
        // Sort children by orderIndex
        parent.children.sort((a: any, b: any) => a.orderIndex - b.orderIndex);
      } else {
        // If parent not found (orphan), push to root or ignore?
        // Let's push to root to be safe so it's visible
        rootModules.push(module);
      }
    } else {
      rootModules.push(module);
    }
  });

  // Sort root modules
  rootModules.sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  return rootModules;
}

export default function AdminTrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: course, isLoading, error } = useQuery({
    queryKey: ["admin", "course", id],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/courses/${id}`);
      return response.data.data;
    },
    retry: 1,
  });

  const getLessonIcon = (type: string) => {
    switch (type) {
      case "video": return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case "text": return <FileText className="h-4 w-4 text-gray-500" />;
      case "quiz": return <HelpCircle className="h-4 w-4 text-orange-500" />;
      case "track_definition": return <Layout className="h-4 w-4 text-purple-500" />;
      default: return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const getLessonTypeLabel = (type: string) => {
    switch (type) {
      case "video": return "Видео";
      case "text": return "Текст";
      case "quiz": return "Тест";
      case "track_definition": return "Выбор трека";
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <div className="h-8 w-1/4 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        <div className="space-y-4">
          <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <CircleAlert className="h-10 w-10 text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Курс не найден</h3>
        <p className="text-gray-600 mb-6 max-w-md">
          Возможно, курс был удален.
        </p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Вернуться назад
        </Button>
      </div>
    );
  }

  // Pre-process modules into hierarchy since API returns flat list (likely, based on previous analysis of get course admin API)
  // Wait, the API response for `admin/courses/[id]` returns `modules` array.
  // The backend code shows it includes `modules` ordered by index.
  // If `parentId` relies on restructuring, we need `structureModules`.
  // The API code I viewed earlied (`app/api/admin/courses/[id]/route.ts`) DOES fetch modules but DOES NOT seem to have a recursive include for children or restructuring logic in the response.
  // So `course.modules` is likely a flat list of ALL modules.
  const structuredModules = structureModules(course.modules || []);

  const renderLesson = (lesson: any) => (
    <div
      key={lesson.id}
      className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
    >
      <div className="shrink-0 pt-1">
        {getLessonIcon(lesson.type)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm text-gray-900 truncate">
            {lesson.title}
          </h4>
          <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-muted-foreground font-normal">
            {getLessonTypeLabel(lesson.type)}
          </Badge>
          {lesson.isFree && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-green-50 text-green-700 hover:bg-green-100 border-none">
              Бесплатно
            </Badge>
          )}
          {lesson.isStopLesson && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-red-50 text-red-700 hover:bg-red-100 border-none">
              Стоп-урок
            </Badge>
          )}
        </div>
      </div>

      {/* Admin Action */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild title="Просмотреть урок">
          <Link href={`/admin/trainings/${id}/lessons/${lesson.id}`}>
             <Eye className="h-4 w-4 text-gray-500 hover:text-blue-600" />
          </Link>
      </Button> 
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50/30 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
           <div className="flex items-center gap-4 mb-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/admin/trainings")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                К списку
              </Button>
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-sm text-muted-foreground font-medium">Просмотр структуры курса</span>
           </div>

           <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Cover - Small */}
              <div className="relative h-24 w-40 rounded-lg overflow-hidden shrink-0 border border-gray-100 bg-gray-50">
                {course.coverImage ? (
                  <Image
                    src={getCloudflareImageUrl(course.coverImage)}
                    alt={course.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <BookOpen className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                 <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
                    <Badge className={cn(course.isPublished ? "bg-green-600" : "bg-gray-400")}>
                      {course.isPublished ? "Опубликован" : "Черновик"}
                    </Badge>
                 </div>
                 <p className="text-gray-500 mt-2 line-clamp-2 text-sm max-w-3xl">
                   {course.description || "Нет описания"}
                 </p>
                 <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                   <span className="flex items-center gap-1.5">
                     <BookOpen className="h-4 w-4" />
                     {course.modules?.length || 0} модулей
                   </span>
                   {/* We could count lessons if we flattened them, but simple modules count is enough for header */}
                 </div>
              </div>

              <Button variant="outline" asChild>
                <Link href={`/admin/courses/${id}`}>
                  Редактировать курс
                </Link>
              </Button>
           </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Modules List */}
          <div className="lg:col-span-3 space-y-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-primary/10 text-primary p-1.5 rounded-lg">
                <BarChart className="h-5 w-5" />
              </span>
              Контент курса
            </h2>

            {structuredModules.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed text-muted-foreground">
                    Модули не созданы
                </div>
            ) : (
              <Card className="border-gray-200 shadow-sm overflow-hidden bg-white">
                <Accordion type="multiple" defaultValue={structuredModules.map((m: any) => m.id)} className="w-full">
                  {structuredModules.map((module: any, index: number) => {
                    // Sort lessons just in case
                    const sortedLessons = module.lessons ? [...module.lessons].sort((a: any, b: any) => a.orderIndex - b.orderIndex) : [];
                    const sortedChildren = module.children ? [...module.children].sort((a: any, b: any) => a.orderIndex - b.orderIndex) : [];
                    const totalLessonsInModule = sortedLessons.length + sortedChildren.reduce((acc: number, child: any) => acc + (child.lessons?.length || 0), 0);

                    return (
                      <AccordionItem key={module.id} value={module.id} className="border-b border-gray-100 last:border-0">
                        <AccordionTrigger className="px-6 py-4 hover:bg-gray-50/80 transition-colors">
                          <div className="flex items-center gap-4 text-left">
                            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold shrink-0">
                              {index + 1}
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900 text-base">{module.title}</h3>
                              <p className="text-xs text-gray-500 font-normal mt-0.5">
                                {totalLessonsInModule} уроков • {sortedChildren.length > 0 ? `${sortedChildren.length} подмодулей` : "Нет подмодулей"}
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0 bg-white">
                          
                          {/* Top Level Lessons */}
                          {sortedLessons.length > 0 ? (
                            <div className="bg-white">
                              {sortedLessons.map((lesson: any) => renderLesson(lesson))}
                            </div>
                          ) : (
                             sortedChildren.length === 0 && (
                                <div className="px-6 py-3 text-xs text-gray-400 italic">Нет уроков в этом модуле</div>
                             )
                          )}
                          
                          {/* Submodules */}
                          {sortedChildren.length > 0 && (
                            <div className="bg-gray-50/50 border-t border-gray-100">
                              {sortedChildren.map((submodule: any) => {
                                const subLessons = submodule.lessons ? [...submodule.lessons].sort((a: any, b: any) => a.orderIndex - b.orderIndex) : [];
                                return (
                                  <div key={submodule.id} className="border-t border-gray-100 first:border-t-0">
                                    <div className="px-6 py-3 bg-gray-100/50 flex items-center gap-2">
                                      <CornerDownRight className="h-4 w-4 text-gray-400" />
                                      <span className="font-medium text-sm text-gray-700">{submodule.title}</span>
                                    </div>
                                    <div className="pl-6 bg-white">
                                      {subLessons.length > 0 ? (
                                        subLessons.map((lesson: any) => renderLesson(lesson))
                                      ) : (
                                        <div className="px-6 py-3 text-xs text-gray-400 italic">Нет уроков</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
