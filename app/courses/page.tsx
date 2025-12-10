"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Play, ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  progress: number;
  lastLessonId: string | null;
}

export default function CoursesPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["courses", "my"],
    queryFn: async () => {
      const response = await apiClient.get("/courses/my");
      return response.data.data;
    },
  });

  const filteredCourses =
    courses?.filter((course) =>
      course.title.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Мои курсы</h1>
        <p className="text-gray-600">
          Управляйте своим обучением и отслеживайте прогресс
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Поиск курсов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-gray-300">
            Все ({courses?.length || 0})
          </Button>
          <Button variant="outline" className="border-gray-300">
            В процессе (0)
          </Button>
          <Button variant="outline" className="border-gray-300">
            Завершенные (0)
          </Button>
        </div>
      </div>

      {/* Courses grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse border-gray-200">
              <div className="h-48 bg-gray-200" />
              <CardHeader>
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-full bg-gray-200 rounded mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filteredCourses.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((course) => (
            <Card
              key={course.id}
              className="overflow-hidden hover:shadow-xl transition-all duration-200 border-gray-200 bg-white group"
            >
              {course.coverImage ? (
                <div className="relative w-full h-48 bg-gray-100 overflow-hidden">
                  <Image
                    src={getCloudflareImageUrl(course.coverImage)}
                    alt={course.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="relative w-full h-48 bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                  <BookOpen className="h-16 w-16 text-white opacity-80" />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <CardTitle className="line-clamp-2 text-gray-900 flex-1">{course.title}</CardTitle>
                  <div className="flex items-center gap-1 ml-2">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium text-gray-700">4.8</span>
                  </div>
                </div>
                {course.description && (
                  <CardDescription className="line-clamp-3 text-gray-600">
                    {course.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Прогресс</span>
                    <span className="font-semibold text-gray-900">{course.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </div>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Link href={`/courses/${course.slug}`}>
                    <Play className="mr-2 h-4 w-4" />
                    Продолжить обучение
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery ? "Курсы не найдены" : "Курсы пока не добавлены"}
            </h3>
            <p className="text-sm text-gray-600 text-center max-w-md mb-6">
              {searchQuery
                ? "Попробуйте изменить поисковый запрос"
                : "Курсы появятся здесь после их добавления администратором"}
            </p>
            {searchQuery && (
              <Button 
                variant="outline" 
                className="border-gray-300"
                onClick={() => setSearchQuery("")}
              >
                Очистить поиск
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
