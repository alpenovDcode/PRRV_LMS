"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Eye } from "lucide-react";

interface CourseRow {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  coverImage?: string | null;
  isPublished: boolean;
  createdAt: string;
}

export default function CuratorCoursesPage() {
  const { data, isLoading } = useQuery<CourseRow[]>({
    queryKey: ["curator", "courses"],
    queryFn: async () => (await apiClient.get("/admin/courses")).data.data,
  });

  return (
    <CuratorLayout>
      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Курсы</h1>
            <p className="text-gray-600">Просмотр структуры курсов и материалов</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">Курсов пока нет</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <Link key={c.id} href={`/curator/courses/${c.id}`} className="block group">
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 relative overflow-hidden">
                    {c.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverImage} alt={c.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-12 w-12 text-blue-300" />
                      </div>
                    )}
                    <Badge
                      className={
                        "absolute top-2 right-2 border-0 " +
                        (c.isPublished ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700")
                      }
                    >
                      {c.isPublished ? "Опубликован" : "Черновик"}
                    </Badge>
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-blue-600 pt-1">
                      <Eye className="h-3 w-3" />
                      Открыть структуру
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CuratorLayout>
  );
}
