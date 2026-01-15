"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Settings2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AccessManagerProps {
  enrollment: any;
  onUpdate: () => void;
}

export function AccessManager({ enrollment, onUpdate }: AccessManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(
    enrollment.expiresAt ? new Date(enrollment.expiresAt) : undefined
  );
  
  // Local state for restrictions (initially from props, assuming API returns them)
  const [restrictedModules, setRestrictedModules] = useState<string[]>(enrollment.restrictedModules || []);
  const [restrictedLessons, setRestrictedLessons] = useState<string[]>(enrollment.restrictedLessons || []);

  const { data: course, isLoading: isCourseLoading } = useQuery({
    queryKey: ["admin", "course", enrollment.course.id],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/courses/${enrollment.course.id}`);
      return response.data.data;
    },
    enabled: isOpen,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        restrictedModules,
        restrictedLessons,
      };
      await apiClient.patch(`/admin/enrollments/${enrollment.id}`, payload);
    },
    onSuccess: () => {
      toast.success("Доступы обновлены");
      setIsOpen(false);
      onUpdate();
    },
    onError: () => {
      toast.error("Не удалось обновить доступы");
    },
  });

  const toggleModule = (moduleId: string, checked: boolean) => {
    if (checked) {
      setRestrictedModules(prev => prev.filter(id => id !== moduleId));
    } else {
      setRestrictedModules(prev => [...prev, moduleId]);
    }
  };

  const toggleLesson = (lessonId: string, checked: boolean) => {
    if (checked) {
      setRestrictedLessons(prev => prev.filter(id => id !== lessonId));
    } else {
      setRestrictedLessons(prev => [...prev, lessonId]);
    }
  };

  const isModuleRestricted = (moduleId: string) => restrictedModules.includes(moduleId);
  const isLessonRestricted = (lessonId: string) => restrictedLessons.includes(lessonId);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" />
        Настроить
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Настройка доступа: {enrollment.course.title}</DialogTitle>
            <DialogDescription>
              Управляйте сроком действия и доступностью отдельных модулей.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Expiration Date */}
            <div className="space-y-2">
              <Label>Срок действия доступа</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  value={expiresAt ? format(expiresAt, "yyyy-MM-dd") : ""}
                  onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value) : undefined)}
                  className="w-[240px]"
                />
                <span className="text-sm text-gray-500">
                  {expiresAt ? format(expiresAt, "dd MMMM yyyy", { locale: ru }) : "Бессрочно"}
                </span>
                {expiresAt && (
                   <Button variant="ghost" size="sm" onClick={() => setExpiresAt(undefined)}>
                     Сбросить
                   </Button>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
               <Label className="text-base">Содержание курса</Label>
               <p className="text-sm text-gray-500 mb-4">Снимите галочки с модулей или уроков, чтобы скрыть их от студента.</p>
               
               {isCourseLoading ? (
                 <div className="flex justify-center p-8">
                   <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                 </div>
               ) : course ? (
                 <div className="border rounded-md divide-y">
                    {course.modules.map((module: any) => (
                      <ModuleAccessItem 
                        key={module.id} 
                        module={module}
                        isRestricted={isModuleRestricted(module.id)}
                        restrictedLessons={restrictedLessons}
                        onToggleModule={toggleModule}
                        onToggleLesson={toggleLesson}
                      />
                    ))}
                 </div>
               ) : (
                 <p className="text-red-500">Не удалось загрузить структуру курса</p>
               )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Отмена</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModuleAccessItem({ 
  module, 
  isRestricted, 
  restrictedLessons, 
  onToggleModule, 
  onToggleLesson 
}: any) {
  return (
    <div className="bg-white">
      <div className="flex items-center gap-3 p-3 bg-gray-50/50">
        <Checkbox 
          checked={!isRestricted}
          onCheckedChange={(checked) => onToggleModule(module.id, checked as boolean)}
        />
        <span className={cn("font-medium", isRestricted && "text-gray-400 line-through")}>
           {module.title}
        </span>
      </div>
      
      {!isRestricted && module.lessons && module.lessons.length > 0 && (
         <div className="pl-9 pr-3 pb-3 pt-1 space-y-2">
            {module.lessons.map((lesson: any) => {
               const isLessonRestricted = restrictedLessons.includes(lesson.id);
               return (
                 <div key={lesson.id} className="flex items-center gap-3">
                   <Checkbox 
                     checked={!isLessonRestricted}
                     onCheckedChange={(checked) => onToggleLesson(lesson.id, checked as boolean)}
                   />
                   <span className={cn("text-sm", isLessonRestricted && "text-gray-400 line-through")}>
                     {lesson.title}
                   </span>
                 </div>
               );
            })}
         </div>
      )}
      
      {/* Handle nested children (submodules) if any - assuming simplified structure for now or recursion */}
    </div>
  );
}
