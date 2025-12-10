"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, ChevronUp, ChevronDown, GripVertical, Save, X, Play, FileText, HelpCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

interface AdminLesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz";
  orderIndex: number;
}

interface AdminModule {
  id: string;
  title: string;
  orderIndex: number;
  lessons: AdminLesson[];
}

interface AdminCourseDetail {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  modules: AdminModule[];
}

export default function CourseBuilderPage() {
  const params = useParams();
  const courseId = params.id as string;
  const queryClient = useQueryClient();

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({});
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");
  const [editingLessonTitle, setEditingLessonTitle] = useState("");
  const [editingLessonType, setEditingLessonType] = useState<"video" | "text" | "quiz">("video");

  const { data, isLoading } = useQuery<AdminCourseDetail>({
    queryKey: ["admin", "courses", courseId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/courses/${courseId}`);
      return response.data.data;
    },
  });

  const createModuleMutation = useMutation({
    mutationFn: async (payload: { title: string }) => {
      await apiClient.post("/admin/modules", { courseId, ...payload });
    },
    onSuccess: () => {
      setNewModuleTitle("");
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Модуль создан");
    },
  });

  const updateModuleMutation = useMutation({
    mutationFn: async ({ moduleId, title }: { moduleId: string; title: string }) => {
      await apiClient.patch(`/admin/modules/${moduleId}`, { title });
    },
    onSuccess: () => {
      setEditingModuleId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Название модуля обновлено");
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      await apiClient.delete(`/admin/modules/${moduleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Модуль удален");
    },
  });

  const reorderModuleMutation = useMutation({
    mutationFn: async ({ moduleId, direction }: { moduleId: string; direction: "up" | "down" }) => {
      if (!data) return;
      const sortedModules = [...data.modules].sort((a, b) => a.orderIndex - b.orderIndex);
      const currentIndex = sortedModules.findIndex((m) => m.id === moduleId);
      if (currentIndex === -1) return;

      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= sortedModules.length) return;

      // Меняем местами
      [sortedModules[currentIndex], sortedModules[newIndex]] = [
        sortedModules[newIndex],
        sortedModules[currentIndex],
      ];

      await apiClient.post("/admin/modules/reorder", {
        moduleIds: sortedModules.map((m) => m.id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
    },
  });

  const createLessonMutation = useMutation({
    mutationFn: async (payload: { moduleId: string; title: string; type: "video" | "text" | "quiz" }) => {
      await apiClient.post("/admin/lessons", payload);
    },
    onSuccess: (_, variables) => {
      setNewLessonTitle((prev) => ({ ...prev, [variables.moduleId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Урок создан");
    },
  });

  const updateLessonMutation = useMutation({
    mutationFn: async ({
      lessonId,
      title,
      type,
    }: {
      lessonId: string;
      title?: string;
      type?: "video" | "text" | "quiz";
    }) => {
      await apiClient.patch(`/admin/lessons/${lessonId}`, { title, type });
    },
    onSuccess: () => {
      setEditingLessonId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Урок обновлен");
    },
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      await apiClient.delete(`/admin/lessons/${lessonId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Урок удален");
    },
  });

  const reorderLessonMutation = useMutation({
    mutationFn: async ({
      moduleId,
      lessonId,
      direction,
    }: {
      moduleId: string;
      lessonId: string;
      direction: "up" | "down";
    }) => {
      if (!data) return;
      const courseModule = data.modules.find((m) => m.id === moduleId);
      if (!courseModule) return;

      const sortedLessons = [...courseModule.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
      const currentIndex = sortedLessons.findIndex((l) => l.id === lessonId);
      if (currentIndex === -1) return;

      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= sortedLessons.length) return;

      // Меняем местами
      [sortedLessons[currentIndex], sortedLessons[newIndex]] = [
        sortedLessons[newIndex],
        sortedLessons[currentIndex],
      ];

      await apiClient.post("/admin/lessons/reorder", {
        lessonIds: sortedLessons.map((l) => l.id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
    },
  });

  const startEditModule = (module: AdminModule) => {
    setEditingModuleId(module.id);
    setEditingModuleTitle(module.title);
  };

  const startEditLesson = (lesson: AdminLesson) => {
    setEditingLessonId(lesson.id);
    setEditingLessonTitle(lesson.title);
    setEditingLessonType(lesson.type);
  };

  const sortedModules = data ? [...data.modules].sort((a, b) => a.orderIndex - b.orderIndex) : [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      {isLoading || !data ? (
        <>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">{data.title}</h1>
              <p className="text-gray-600 mt-2">
                Конструктор структуры курса: создавайте модули и уроки, редактируйте названия и порядок.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={data.isPublished ? "default" : "outline"} className="text-sm px-3 py-1">
                {data.isPublished ? "Опубликован" : "Черновик"}
              </Badge>
              <Button variant="outline" asChild className="border-gray-300">
                <Link href={`/admin/courses/${courseId}`}>Настройки курса</Link>
              </Button>
            </div>
          </div>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50 border-b border-gray-200">
              <CardTitle className="text-lg text-gray-900">Модули курса</CardTitle>
              <CardDescription className="text-gray-600">
                Управляйте структурой курса: добавляйте модули и уроки, редактируйте названия и порядок.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* New module form */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newModuleTitle.trim()) return;
                    createModuleMutation.mutate({ title: newModuleTitle.trim() });
                  }}
                >
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="newModule" className="text-gray-700">Новый модуль</Label>
                    <Input
                      id="newModule"
                      placeholder="Например: Введение в курс"
                      value={newModuleTitle}
                      onChange={(e) => setNewModuleTitle(e.target.value)}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                    disabled={createModuleMutation.isPending || !newModuleTitle.trim()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить модуль
                  </Button>
                </form>
              </div>

              {/* Modules list */}
              <div className="space-y-4">
                {sortedModules.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500">Модулей пока нет — добавьте первый модуль.</p>
                  </div>
                )}
                {sortedModules.map((module, moduleIdx) => {
                  const sortedLessons = [...module.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
                  const isEditingModule = editingModuleId === module.id;

                  return (
                    <Card key={module.id} className="border-gray-200 shadow-sm">
                      <CardHeader className="bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 flex items-center gap-3">
                            <GripVertical className="h-5 w-5 text-gray-400" />
                            {isEditingModule ? (
                              <div className="flex-1 flex items-center gap-2">
                                <Input
                                  value={editingModuleTitle}
                                  onChange={(e) => setEditingModuleTitle(e.target.value)}
                                  className="flex-1 border-gray-300 focus:border-blue-500"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updateModuleMutation.mutate({
                                      moduleId: module.id,
                                      title: editingModuleTitle,
                                    });
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingModuleId(null)}
                                  className="border-gray-300"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <CardTitle className="text-base text-gray-900">
                                    Модуль {module.orderIndex + 1}: {module.title}
                                  </CardTitle>
                                  <CardDescription className="text-gray-600">
                                    {sortedLessons.length} {sortedLessons.length === 1 ? "урок" : "уроков"}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-1 ml-auto">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startEditModule(module)}
                                    className="text-gray-600 hover:text-gray-900"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      reorderModuleMutation.mutate({ moduleId: module.id, direction: "up" })
                                    }
                                    disabled={moduleIdx === 0}
                                    className="text-gray-600 hover:text-gray-900"
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      reorderModuleMutation.mutate({ moduleId: module.id, direction: "down" })
                                    }
                                    disabled={moduleIdx === sortedModules.length - 1}
                                    className="text-gray-600 hover:text-gray-900"
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm("Вы уверены, что хотите удалить этот модуль?")) {
                                        deleteModuleMutation.mutate(module.id);
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        {/* Lessons list */}
                        <div className="space-y-2">
                          {sortedLessons.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">
                              В этом модуле пока нет уроков.
                            </p>
                          ) : (
                            sortedLessons.map((lesson, lessonIdx) => {
                              const isEditingLesson = editingLessonId === lesson.id;
                              const typeIcons = {
                                video: Play,
                                text: FileText,
                                quiz: HelpCircle,
                              };
                              const TypeIcon = typeIcons[lesson.type];

                              return (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors"
                                >
                                  <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                  <TypeIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                  {isEditingLesson ? (
                                    <div className="flex-1 flex items-center gap-2">
                                      <Input
                                        value={editingLessonTitle}
                                        onChange={(e) => setEditingLessonTitle(e.target.value)}
                                        className="flex-1 border-gray-300 focus:border-blue-500"
                                        autoFocus
                                      />
                                      <Select
                                        value={editingLessonType}
                                        onValueChange={(v) =>
                                          setEditingLessonType(v as "video" | "text" | "quiz")
                                        }
                                      >
                                        <SelectTrigger className="w-32 border-gray-300">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="video">Видео</SelectItem>
                                          <SelectItem value="text">Текст</SelectItem>
                                          <SelectItem value="quiz">Тест</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          updateLessonMutation.mutate({
                                            lessonId: lesson.id,
                                            title: editingLessonTitle,
                                            type: editingLessonType,
                                          });
                                        }}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                      >
                                        <Save className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingLessonId(null)}
                                        className="border-gray-300"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900">
                                          Урок {lesson.orderIndex + 1}: {lesson.title}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                          Тип: {lesson.type === "video" ? "Видео" : lesson.type === "text" ? "Текст" : "Тест"}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          asChild
                                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          title="Редактировать содержимое урока"
                                        >
                                          <Link href={`/admin/lessons/${lesson.id}/edit`}>
                                            <FileText className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => startEditLesson(lesson)}
                                          className="text-gray-600 hover:text-gray-900"
                                          title="Редактировать название и тип"
                                        >
                                          <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            reorderLessonMutation.mutate({
                                              moduleId: module.id,
                                              lessonId: lesson.id,
                                              direction: "up",
                                            })
                                          }
                                          disabled={lessonIdx === 0}
                                          className="text-gray-600 hover:text-gray-900"
                                        >
                                          <ChevronUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            reorderLessonMutation.mutate({
                                              moduleId: module.id,
                                              lessonId: lesson.id,
                                              direction: "down",
                                            })
                                          }
                                          disabled={lessonIdx === sortedLessons.length - 1}
                                          className="text-gray-600 hover:text-gray-900"
                                        >
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (confirm("Вы уверены, что хотите удалить этот урок?")) {
                                              deleteLessonMutation.mutate(lesson.id);
                                            }
                                          }}
                                          className="text-red-600 hover:text-red-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* New lesson form */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <form
                            className="flex flex-col gap-2 sm:flex-row sm:items-center"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const title = (newLessonTitle[module.id] || "").trim();
                              if (!title) return;
                              createLessonMutation.mutate({
                                moduleId: module.id,
                                title,
                                type: "video",
                              });
                            }}
                          >
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs text-gray-600">Новый урок</Label>
                              <Input
                                placeholder="Например: Приветствие и цели курса"
                                value={newLessonTitle[module.id] || ""}
                                onChange={(e) =>
                                  setNewLessonTitle((prev) => ({
                                    ...prev,
                                    [module.id]: e.target.value,
                                  }))
                                }
                                className="border-gray-300 focus:border-blue-500"
                              />
                            </div>
                            <Button
                              type="submit"
                              className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap mt-6 sm:mt-0"
                              disabled={createLessonMutation.isPending || !newLessonTitle[module.id]?.trim()}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Добавить урок
                            </Button>
                          </form>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
