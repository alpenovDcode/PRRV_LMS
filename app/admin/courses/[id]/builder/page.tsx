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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash, Pencil, ChevronUp, ChevronDown, GripVertical, Save, X, Play, FileText, CircleHelp, CornerDownRight, Lock } from "lucide-react";
import { useState, useMemo } from "react";
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
  parentId: string | null;
  lessons: AdminLesson[];
  allowedTariffs: string[];
  allowedTracks: string[];
  allowedGroups: string[];
}

interface AdminCourseDetail {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  modules: AdminModule[];
}

interface AdminModuleWithChildren extends AdminModule {
  children: AdminModuleWithChildren[];
}

interface AccessSettingsDialogProps {
  module: AdminModule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { allowedTariffs: string[]; allowedTracks: string[]; allowedGroups: string[] }) => void;
}

function AccessSettingsDialog({ module, open, onOpenChange, onSave }: AccessSettingsDialogProps) {
  const [tariffs, setTariffs] = useState<string[]>(module.allowedTariffs || []);
  const [tracks, setTracks] = useState<string[]>(module.allowedTracks || []);
  const [groups, setGroups] = useState<string[]>(module.allowedGroups || []);

  // Updated track list as per user request
  const availableTracks = [
    "Заполнить расписание",
    "Повысить чек",
    "Перейти на онлайн",
    "Стать репетитором",
    "Перейти на группы"
  ];

  // Fetch groups using React Query
  const { data: groupsData } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/groups");
      return response.data.data; // Assuming API returns { data: Group[] }
    },
    enabled: open, // Only fetch when dialog is open
  });

  const availableGroups = groupsData || [];

  const handleSave = () => {
    // Ensure we send arrays, never undefined/null
    onSave({ 
      allowedTariffs: tariffs || [], 
      allowedTracks: tracks || [], 
      allowedGroups: groups || [] 
    });
    onOpenChange(false);
  };

  const toggleTariff = (tariff: string) => {
    setTariffs(prev => 
      prev.includes(tariff) ? prev.filter(t => t !== tariff) : [...prev, tariff]
    );
  };

  const toggleTrack = (track: string) => {
    setTracks(prev => 
      prev.includes(track) ? prev.filter(t => t !== track) : [...prev, track]
    );
  };

  const toggleGroup = (groupId: string) => {
    setGroups(prev => 
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const tariffLabels: Record<string, string> = {
    "VR": "ВР (Востребованный)",
    "LR": "ЛР (Лидер Рынка)",
    "SR": "СР (Самостоятельный)"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Настройки доступа: {module.title}</DialogTitle>
          <DialogDescription>
            Настройте ограничения доступа. Если поле пустое, модуль доступен всем.
            Пользователь должен соответствовать ВСЕМ заданным критериям.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Tariffs */}
          <div className="space-y-2">
            <Label>Тарифы</Label>
            <div className="flex flex-col gap-2">
              {["VR", "LR", "SR"].map((tariff) => (
                <div key={tariff} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`tariff-${tariff}`} 
                    checked={tariffs.includes(tariff)}
                    onCheckedChange={() => toggleTariff(tariff)}
                  />
                  <label
                    htmlFor={`tariff-${tariff}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {tariffLabels[tariff]}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {tariffs.length === 0 ? "Доступно для всех тарифов" : `Выбрано: ${tariffs.map(t => tariffLabels[t].split(" ")[0]).join(", ")}`}
            </p>
          </div>

          {/* Tracks */}
          <div className="space-y-2">
            <Label>Треки</Label>
            <Select 
              onValueChange={(value) => toggleTrack(value)} 
              value={tracks.length > 0 ? tracks[tracks.length - 1] : undefined} // Dummy value to reset
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите треки" />
              </SelectTrigger>
              <SelectContent>
                {availableTracks.map((track) => (
                  <SelectItem key={track} value={track}>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={tracks.includes(track)} />
                      <span>{track}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2 mt-2">
              {tracks.map(track => (
                <Badge key={track} variant="secondary" className="gap-1">
                  {track}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => toggleTrack(track)} />
                </Badge>
              ))}
            </div>
            {tracks.length === 0 && <p className="text-xs text-gray-500">Доступно для всех треков</p>}
          </div>

          {/* Groups */}
          <div className="space-y-2">
            <Label>Группы</Label>
            <Select 
              onValueChange={(value) => toggleGroup(value)}
              value={groups.length > 0 ? groups[groups.length - 1] : undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите группы" />
              </SelectTrigger>
              <SelectContent>
                {/* @ts-ignore - groupsData might be any */}
                {availableGroups.map((group: any) => (
                  <SelectItem key={group.id} value={group.id}>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={groups.includes(group.id)} />
                      <span>{group.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2 mt-2">
              {groups.map(groupId => {
                // @ts-ignore
                const groupName = availableGroups.find((g: any) => g.id === groupId)?.name || groupId;
                return (
                  <Badge key={groupId} variant="secondary" className="gap-1">
                    {groupName}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleGroup(groupId)} />
                  </Badge>
                );
              })}
            </div>
            {groups.length === 0 && <p className="text-xs text-gray-500">Доступно для всех групп</p>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Сохранить настройки</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CourseBuilderPage() {
  const params = useParams();
  const courseId = params.id as string;
  const queryClient = useQueryClient();

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleParentId, setNewModuleParentId] = useState<string | "root">("root");
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({});
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");
  const [editingLessonTitle, setEditingLessonTitle] = useState("");
  const [editingLessonType, setEditingLessonType] = useState<"video" | "text" | "quiz">("video");
  
  // Access Settings State
  const [accessSettingsModuleId, setAccessSettingsModuleId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AdminCourseDetail>({
    queryKey: ["admin", "courses", courseId],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/courses/${courseId}`);
      return response.data.data;
    },
  });

  const createModuleMutation = useMutation({
    mutationFn: async (payload: { title: string; parentId?: string }) => {
      await apiClient.post("/admin/modules", { courseId, ...payload });
    },
    onSuccess: () => {
      setNewModuleTitle("");
      setNewModuleParentId("root");
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Модуль создан");
    },
  });

  const updateModuleMutation = useMutation({
    mutationFn: async ({ moduleId, title, allowedTariffs, allowedTracks, allowedGroups }: { moduleId: string; title?: string; allowedTariffs?: string[]; allowedTracks?: string[]; allowedGroups?: string[] }) => {
      // Ensure we send arrays, never undefined/null
      const payload = {
        title,
        allowedTariffs: allowedTariffs || [],
        allowedTracks: allowedTracks || [],
        allowedGroups: allowedGroups || []
      };
      await apiClient.patch(`/admin/modules/${moduleId}`, payload);
    },
    onSuccess: () => {
      setEditingModuleId(null);
      setAccessSettingsModuleId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses", courseId] });
      toast.success("Модуль обновлен");
    },
    onError: (error) => {
      console.error("Failed to update module:", error);
      toast.error("Ошибка при обновлении модуля");
    }
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
    mutationFn: async ({ moduleId, direction, parentId }: { moduleId: string; direction: "up" | "down"; parentId: string | null }) => {
      if (!data) return;
      
      // Filter siblings based on parentId
      const siblings = data.modules.filter(m => m.parentId === parentId);
      const sortedSiblings = [...siblings].sort((a, b) => a.orderIndex - b.orderIndex);
      
      const currentIndex = sortedSiblings.findIndex((m) => m.id === moduleId);
      if (currentIndex === -1) return;

      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= sortedSiblings.length) return;

      // Swap
      [sortedSiblings[currentIndex], sortedSiblings[newIndex]] = [
        sortedSiblings[newIndex],
        sortedSiblings[currentIndex],
      ];

      await apiClient.post("/admin/modules/reorder", {
        moduleIds: sortedSiblings.map((m) => m.id),
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

  // Build tree structure
  const rootModules = useMemo(() => {
    if (!data) return [];
    
    const modulesMap = new Map<string, AdminModuleWithChildren>();
    data.modules.forEach(m => modulesMap.set(m.id, { ...m, children: [] }));
    
    const roots: AdminModuleWithChildren[] = [];
    
    data.modules.forEach(m => {
      if (m.parentId) {
        const parent = modulesMap.get(m.parentId);
        if (parent) {
          parent.children.push(modulesMap.get(m.id)!);
        }
      } else {
        roots.push(modulesMap.get(m.id)!);
      }
    });

    // Sort everything
    const sortModules = (modules: AdminModuleWithChildren[]) => {
      modules.sort((a, b) => a.orderIndex - b.orderIndex);
      modules.forEach(m => sortModules(m.children));
    };
    
    sortModules(roots);
    return roots;
  }, [data]);

  // Helper to render a module (recursive-ready, though we use it inside the loop)
  const renderModule = (module: AdminModuleWithChildren, isSubmodule = false) => {
    const sortedLessons = [...module.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
    const isEditingModule = editingModuleId === module.id;
    const hasAccessRestrictions = (module.allowedTariffs?.length > 0) || (module.allowedTracks?.length > 0) || (module.allowedGroups?.length > 0);

    return (
      <Card key={module.id} className={`border-gray-200 shadow-sm ${isSubmodule ? "ml-8 mt-4 border-l-4 border-l-blue-100" : ""}`}>
        <CardHeader className="bg-gray-50 border-b border-gray-200 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 flex items-center gap-3">
              <GripVertical className="h-5 w-5 text-gray-400" />
              {isSubmodule && <CornerDownRight className="h-4 w-4 text-gray-400" />}
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
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base text-gray-900">
                        {isSubmodule ? "Подмодуль" : `Модуль ${module.orderIndex + 1}`}: {module.title}
                      </CardTitle>
                      {hasAccessRestrictions && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 bg-amber-50 gap-1">
                          <Lock className="h-3 w-3" />
                          Доступ ограничен
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-gray-600 text-xs">
                      {sortedLessons.length} {sortedLessons.length === 1 ? "урок" : "уроков"}
                      {module.children.length > 0 && `, ${module.children.length} подмодулей`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAccessSettingsModuleId(module.id)}
                      className="text-gray-600 hover:text-blue-600"
                      title="Настройки доступа"
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditModule(module)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        reorderModuleMutation.mutate({ moduleId: module.id, direction: "up", parentId: module.parentId })
                      }
                      // Disable if first in its scope
                      disabled={module.orderIndex === 0} 
                      className="text-gray-600 hover:text-gray-900"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        reorderModuleMutation.mutate({ moduleId: module.id, direction: "down", parentId: module.parentId })
                      }
                      // Disable if last in its scope (need to know siblings count, simplified here)
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
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Submodules */}
          {module.children.length > 0 && (
            <div className="space-y-4">
              {module.children.map(child => renderModule(child, true))}
            </div>
          )}

          {/* Lessons list */}
          <div className="space-y-2">
            {sortedLessons.length === 0 && module.children.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                В этом модуле пока нет уроков.
              </p>
            ) : (
              sortedLessons.map((lesson, lessonIdx) => {
                const isEditingLesson = editingLessonId === lesson.id;
                const typeIcons = {
                  video: Play,
                  text: FileText,
                  quiz: CircleHelp,
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
                            <Pencil className="h-4 w-4" />
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
                            <Trash className="h-4 w-4" />
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
  };

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
                    createModuleMutation.mutate({ 
                      title: newModuleTitle.trim(),
                      parentId: newModuleParentId === "root" ? undefined : newModuleParentId
                    });
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
                  <div className="w-full sm:w-64 space-y-1">
                    <Label htmlFor="parentModule" className="text-gray-700">Родительский модуль</Label>
                    <Select value={newModuleParentId} onValueChange={setNewModuleParentId}>
                      <SelectTrigger id="parentModule" className="border-gray-300">
                        <SelectValue placeholder="Корневой модуль" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Корневой модуль</SelectItem>
                        {rootModules.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {rootModules.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    В курсе пока нет модулей. Создайте первый модуль выше.
                  </p>
                )}
                {rootModules.map(module => renderModule(module))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Access Settings Dialog */}
      {accessSettingsModuleId && data && (
        <AccessSettingsDialog
          open={!!accessSettingsModuleId}
          onOpenChange={(open) => !open && setAccessSettingsModuleId(null)}
          module={data.modules.find(m => m.id === accessSettingsModuleId)!}
          onSave={(settings) => {
            updateModuleMutation.mutate({
              moduleId: accessSettingsModuleId,
              ...settings
            });
          }}
        />
      )}
    </div>
  );
}
