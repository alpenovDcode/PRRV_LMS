"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, UserCircle2, Calendar, CheckCircle2, Clock, XCircle, FileSignature } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StudentHomework {
  id: string;
  status: "pending" | "approved" | "rejected";
  content: string | null;
  files: any | null;
  curatorComment: string | null;
  curatorAudioUrl: string | null;
  reviewedAt: string | null;
  createdAt: string;
  lesson: {
    id: string;
    title: string;
    courseId: string;
    courseTitle: string;
    courseSlug: string;
  } | null;
  curator: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

export default function StudentHomeworkPage() {
  const { data: homeworks, isLoading } = useQuery<StudentHomework[]>({
    queryKey: ["student-homework"],
    queryFn: async () => {
      const res = await apiClient.get("/student/homework");
      return res.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <FileSignature className="h-8 w-8 text-blue-600" />
          Мои домашние задания
        </h1>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse border-gray-100">
              <CardHeader className="space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-100 rounded w-1/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-24 bg-gray-50 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 md:p-8 border border-blue-100/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-100/30 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-40 h-40 bg-indigo-100/30 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <FileSignature className="h-8 w-8 text-blue-600" />
            Мои домашние задания
          </h1>
          <p className="text-gray-600 max-w-2xl">
            Здесь отображается вся история отправленных вами домашних заданий и обратная связь от кураторов.
          </p>
        </div>
      </div>

      {!homeworks || homeworks.length === 0 ? (
        <Card className="border-dashed border-2 py-12">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold text-gray-900">Вы еще не отправляли домашних заданий</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Когда вы пройдете урок и отправите задание на проверку, оно появится здесь.
              </p>
            </div>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/courses">К списку курсов</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {homeworks.map((hw) => {
            const isApproved = hw.status === "approved";
            const isRejected = hw.status === "rejected";
            const isPending = hw.status === "pending";

            // Parse content safely
            let parsedContent = hw.content || "";
            let parsedAnswers: Record<string, any> | null = null;
            try {
              const obj = JSON.parse(hw.content || "{}");
              if (obj && typeof obj === "object") {
                if (obj._answers) {
                  parsedAnswers = obj._answers;
                } else {
                   parsedContent = obj.text || obj.message || hw.content;
                }
              }
            } catch {
              // Not JSON, just use raw string
              parsedContent = hw.content || "";
            }

            return (
              <Card key={hw.id} className="overflow-hidden border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className={`border-b border-gray-100 pb-4 ${isApproved ? 'bg-green-50/30' : isRejected ? 'bg-red-50/30' : 'bg-gray-50/50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <span className="truncate max-w-[200px]">{hw.lesson?.courseTitle || "Курс"}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Calendar className="h-3 w-3" />
                          {formatDate(hw.createdAt)}
                        </span>
                      </div>
                      <CardTitle className="text-xl text-gray-900 line-clamp-2">
                        {hw.lesson?.title || "Без названия"}
                      </CardTitle>
                    </div>

                    <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                      {isPending && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 font-medium px-3 py-1 text-sm border-yellow-200">
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          Ожидает проверки
                        </Badge>
                      )}
                      {isApproved && (
                        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 font-medium px-3 py-1 text-sm border-green-200">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Принято
                        </Badge>
                      )}
                      {isRejected && (
                        <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 font-medium px-3 py-1 text-sm border-red-200">
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Отклонено
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                    {/* Student Submission */}
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                        <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                          Вы
                        </div>
                        Ваш ответ
                      </div>
                      
                      {parsedAnswers ? (
                         <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                           {Object.entries(parsedAnswers).map(([key, val], idx) => (
                             <div key={idx} className="space-y-1">
                                <span className="text-gray-500 text-xs uppercase tracking-wide block">{key}</span>
                                <span className="text-gray-900 font-medium">{String(val)}</span>
                             </div>
                           ))}
                         </div>
                      ) : (
                        <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100 whitespace-pre-wrap">
                          {parsedContent || <span className="text-gray-400 italic">Нет текстового ответа</span>}
                        </div>
                      )}

                      {hw.files && Array.isArray(hw.files) && hw.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {hw.files.map((file: any, index: number) => (
                            <a
                              key={index}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="max-w-[150px] truncate">{file.name || "Файл"}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Curator Review */}
                    <div className="p-6 space-y-4 bg-gray-50/30">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          {hw.curator ? (
                            <div className="flex items-center gap-2">
                              {hw.curator.avatarUrl ? (
                                <img src={hw.curator.avatarUrl} alt={hw.curator.name || ""} className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                <UserCircle2 className="w-6 h-6 text-gray-400" />
                              )}
                              <span>{hw.curator.name || "Куратор"}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <UserCircle2 className="w-6 h-6 text-gray-400" />
                              <span>Куратор</span>
                            </div>
                          )}
                        </div>
                        {hw.reviewedAt && (
                          <span className="text-xs text-gray-400">
                            {formatDate(hw.reviewedAt)}
                          </span>
                        )}
                      </div>

                      {isPending ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-center space-y-2">
                           <Clock className="w-8 h-8 opacity-50" />
                           <p className="text-sm">Задание находится в очереди на проверку</p>
                        </div>
                      ) : (
                         <div className="space-y-4">
                           {hw.curatorComment ? (
                              <div className="prose prose-sm max-w-none text-gray-800 bg-white p-4 rounded-lg border border-gray-100 shadow-sm leading-relaxed">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkBreaks]}
                                >
                                  {hw.curatorComment}
                                </ReactMarkdown>
                              </div>
                           ) : (
                             <p className="text-sm text-gray-400 italic">Без текстового комментария</p>
                           )}

                           {hw.curatorAudioUrl && (
                             <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm mt-4">
                               <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Голосовой ответ</p>
                               <audio controls src={hw.curatorAudioUrl} className="w-full h-10" />
                             </div>
                           )}
                         </div>
                      )}
                    </div>
                  </div>
                </CardContent>
                
                {hw.lesson?.courseSlug && hw.lesson?.id && (
                  <CardFooter className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex justify-end">
                    <Button variant="ghost" size="sm" asChild className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 -my-2">
                      <Link href={`/learn/${hw.lesson.courseSlug}/${hw.lesson.id}`}>
                        Перейти к уроку
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Link>
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
