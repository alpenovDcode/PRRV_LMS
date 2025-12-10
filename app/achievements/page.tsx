"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trophy, Award, Medal, Lock, Download, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Achievement {
  id: string;
  type: "badge" | "certificate";
  title: string;
  description: string;
  icon?: string;
  earnedAt: string;
  courseId?: string;
  courseTitle?: string;
  progress?: number;
  points?: number;
}

export default function AchievementsPage() {
  const { data: achievements, isLoading } = useQuery<Achievement[]>({
    queryKey: ["achievements"],
    queryFn: async () => {
      const response = await apiClient.get("/achievements");
      return response.data.data || [];
    },
  });

  const badges = achievements?.filter((a) => a.type === "badge") || [];
  const certificates = achievements?.filter((a) => a.type === "certificate") || [];

  // Mock data for locked achievements (in real app, this would come from API)
  const lockedAchievements = [
    { id: "1", title: "Мастер обучения", progress: 66, points: 100 },
    { id: "2", title: "Экспертная серия", progress: 60, points: 100 },
    { id: "3", title: "Преданный студент", progress: 43, points: 100 },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Достижения</h1>
        <p className="text-gray-600">Ваши награды и сертификаты</p>
      </div>

      {/* Completed Badges */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Award className="h-6 w-6 text-blue-600" />
          Бейджи
        </h2>
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse border-gray-200">
                <CardContent className="pt-6">
                  <div className="h-24 bg-gray-200 rounded-full mx-auto" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : badges.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <Card key={badge.id} className="text-center border-gray-200 hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="flex justify-center mb-4">
                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                      <Trophy className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{badge.title}</h3>
                  <p className="text-sm text-gray-600 mb-3">{badge.description}</p>
                  {badge.points && (
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-full mb-3">
                      <Star className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-600">{badge.points}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Получено {new Date(badge.earnedAt).toLocaleDateString("ru-RU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric"
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-gray-200">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <Award className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Пока нет бейджей</h3>
              <p className="text-sm text-gray-600 text-center max-w-md">
                Выполняйте задания и проходите курсы, чтобы получать бейджи
              </p>
            </CardContent>
          </Card>
        )}

        {/* Locked Achievements */}
        {badges.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">В процессе</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {lockedAchievements.map((achievement) => (
                <Card key={achievement.id} className="border-gray-200 bg-gray-50">
                  <CardContent className="pt-6">
                    <div className="flex justify-center mb-4">
                      <div className="h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center">
                        <Lock className="h-10 w-10 text-gray-400" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-gray-700 mb-2">{achievement.title}</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Прогресс</span>
                        <span className="font-semibold text-gray-700">{achievement.progress}%</span>
                      </div>
                      <Progress value={achievement.progress} className="h-2" />
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-gray-200 rounded-full">
                      <Star className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-600">{achievement.points}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Certificates */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Medal className="h-6 w-6 text-blue-600" />
          Мои сертификаты
        </h2>
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse border-gray-200">
                <CardContent className="pt-6">
                  <div className="h-32 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : certificates.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {certificates.map((cert) => (
              <Card key={cert.id} className="border-gray-200 hover:shadow-lg transition-shadow bg-white">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Medal className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-gray-900">{cert.title}</CardTitle>
                      {cert.courseTitle && (
                        <CardDescription className="text-gray-600 mt-1">
                          Инструктор: {cert.courseTitle}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm text-gray-600 mb-2">{cert.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Дата завершения: {new Date(cert.earnedAt).toLocaleDateString("ru-RU", {
                          year: "numeric",
                          month: "long",
                          day: "numeric"
                        })}
                      </span>
                      <span className="font-semibold text-gray-700">95%</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Скачать PDF
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-gray-200">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <Medal className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Пока нет сертификатов</h3>
              <p className="text-sm text-gray-600 text-center max-w-md">
                Завершите курсы, чтобы получить сертификаты
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

