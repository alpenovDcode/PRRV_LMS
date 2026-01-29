"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useParams } from "next/navigation";
import { LessonContentPlayer } from "@/components/learn/lesson-content-player";

export default function AdminLessonViewerPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const lessonId = params.lessonId as string;

  const { data: lesson, isLoading, error } = useQuery({
    queryKey: ["admin", "lesson", lessonId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/lessons/${lessonId}`);
      return response.data.data;
    },
    // Don't retry endlessly if not found
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-bold">Урок не найден</h2>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Вернуться назад
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
       {/* Top Bar */}
       <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/trainings/${courseId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                К структуре курса
            </Button>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm font-medium text-gray-900 truncate max-w-md">
                {lesson.title}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                Режим администратора
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                    const link = `${window.location.origin}/learn/${lesson.module.course.slug}/${lesson.id}`;
                    navigator.clipboard.writeText(link);
                    toast.success("Ссылка скопирована");
                }}
            >
                <LinkIcon className="mr-2 h-4 w-4" />
                Скопировать ссылку
            </Button>
            <Button variant="outline" size="sm" asChild>
                <a href={`/admin/lessons/${lessonId}/edit`}>
                    Редактировать
                </a>
            </Button>
          </div>
       </div>

       {/* Content Area */}
       <div className="flex-1 container mx-auto max-w-4xl px-4 py-8">
           <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
               <LessonContentPlayer 
                   lesson={lesson} 
                   isPreview={true} 
               />
           </div>
       </div>
    </div>
  );
}
