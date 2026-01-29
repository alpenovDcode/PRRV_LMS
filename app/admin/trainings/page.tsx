"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { BookOpen, ChevronRight, Eye } from "lucide-react";

interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  createdAt: string;
  _count?: {
      modules: number;
      enrollments: number;
  };
}

export default function AdminTrainingsPage() {
  const { data, isLoading } = useQuery<AdminCourse[]>({
    queryKey: ["admin", "courses"],
    queryFn: async () => {
      // Reusing the same endpoint as courses management, might refine if needed
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Тренинги</h1>
          <p className="text-muted-foreground mt-1">
            Просмотр контента курсов (как видит студент, но в админке).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading
          ? [...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="space-y-2 pb-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))
          : data?.map((course) => (
              <Card key={course.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="line-clamp-2 text-lg group-hover:text-primary transition-colors">
                      {course.title}
                    </CardTitle>
                    <Badge variant={course.isPublished ? "default" : "secondary"}>
                      {course.isPublished ? "Активен" : "Черновик"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Slug: {course.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/admin/trainings/${course.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      Просмотреть контент
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
      </div>
      
      {!isLoading && data && data.length === 0 && (
         <div className="text-center py-12 bg-white rounded-lg border border-dashed">
             <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
             <h3 className="text-lg font-medium">Нет курсов</h3>
             <p className="text-muted-foreground">Создайте курс в разделе "Курсы", чтобы он появился здесь.</p>
         </div>
      )}
    </div>
  );
}
