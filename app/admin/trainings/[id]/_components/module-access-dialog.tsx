"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Lock, 
  Unlock, 
  Search, 
  Calendar,
  Filter,
  User,
  Users,
  Info
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ModuleAccessDialogProps {
  courseId: string;
  modules: any[]; // Flat modules list for selection
}

interface AccessRecord {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    track: string | null;
    tariff: string | null;
  };
  access: {
    isAccessible: boolean;
    reason: "ok" | "tariff_mismatch" | "track_mismatch" | "group_mismatch" | "time_locked" | "restricted_manually";
    unlockDate: string | null;
    details?: string;
  };
}

export function ModuleAccessDialog({ courseId, modules }: ModuleAccessDialogProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(modules[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "open" | "locked">("all");

  const { data: accessData, isLoading } = useQuery<AccessRecord[]>({
    queryKey: ["admin", "course", courseId, "access", selectedModuleId],
    queryFn: async () => {
      if (!selectedModuleId) return [];
      const response = await apiClient.get(`/admin/courses/${courseId}/access`, {
        params: { moduleId: selectedModuleId }
      });
      return response.data.data;
    },
    enabled: !!selectedModuleId,
  });

  const selectedModule = modules.find(m => m.id === selectedModuleId);

  const filteredData = accessData?.filter(record => {
    const matchesSearch = record.user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          record.user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterType === "open") return record.access.isAccessible;
    if (filterType === "locked") return !record.access.isAccessible;

    return true;
  });

  const getStatusBadge = (reason: string, unlockDate: string | null) => {
    switch (reason) {
      case "ok":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none"><Unlock className="w-3 h-3 mr-1" /> Доступ открыт</Badge>;
      case "time_locked":
        return (
          <div className="flex flex-col items-end">
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 mb-1">
              <Calendar className="w-3 h-3 mr-1" /> 
              {unlockDate ? formatDate(unlockDate) : "Ожидание события"}
            </Badge>
          </div>
        );
      case "tariff_mismatch":
        return <Badge variant="outline" className="text-gray-500 border-gray-200">Тариф не подходит</Badge>;
      case "track_mismatch":
        return <Badge variant="outline" className="text-gray-500 border-gray-200">Трек не подходит</Badge>;
      case "group_mismatch":
        return <Badge variant="outline" className="text-gray-500 border-gray-200">Группа не подходит</Badge>;
      case "restricted_manually":
        return <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-none">Закрыто вручную</Badge>;
      default:
        return <Badge variant="outline">Locked</Badge>;
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
            <Users className="h-4 w-4" />
            Доступы пользователей
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <DialogTitle>Проверка доступов студентов</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 overflow-hidden">
             {/* Sidebar: Modules List */}
             <div className="w-1/3 border-r border-gray-100 flex flex-col bg-gray-50/30">
                <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-sm text-gray-900 mb-2">Выберите модуль</h3>
                    <p className="text-xs text-gray-500">Показывает настройки модуля и список студентов</p>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {modules.map((module, idx) => (
                            <button
                                key={module.id}
                                onClick={() => setSelectedModuleId(module.id)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2
                                    ${selectedModuleId === module.id 
                                        ? "bg-white shadow-sm ring-1 ring-gray-200 text-blue-700 font-medium" 
                                        : "text-gray-600 hover:bg-gray-100"}`}
                            >
                                <span className="flex-shrink-0 bg-gray-100 text-gray-500 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold">
                                    {idx + 1}
                                </span>
                                <span className="truncate">{module.title}</span>
                                {module.openAt && <Calendar className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />}
                            </button>
                        ))}
                    </div>
                </ScrollArea>
             </div>

             {/* Content: Students List */}
             <div className="flex-1 flex flex-col bg-white">
                {selectedModuleId ? (
                    <>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Поиск по имени или email..."
                                    className="pl-9 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 text-gray-500">
                                  <Info className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-0" align="end">
                                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                  <h4 className="font-medium text-sm text-gray-900">Правила доступа к модулю</h4>
                                </div>
                                <div className="p-4 space-y-4 text-sm">
                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Тарифы</div>
                                    {selectedModule.allowedTariffs && selectedModule.allowedTariffs.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {selectedModule.allowedTariffs.map((t: string) => (
                                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic">Доступно всем тарифам</span>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Треки</div>
                                    {selectedModule.allowedTracks && selectedModule.allowedTracks.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {selectedModule.allowedTracks.map((t: string) => (
                                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic">Доступно всем трекам</span>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Группы</div>
                                    {selectedModule.allowedGroups && selectedModule.allowedGroups.length > 0 ? (
                                      <div className="text-gray-600">
                                        {selectedModule.allowedGroups.length} групп(ы)
                                      </div>
                                    ) : (
                                      <span className="text-gray-500 italic">Все группы</span>
                                    )}
                                  </div>

                                  {selectedModule.openAt && (
                                     <div className="space-y-1">
                                       <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Дата открытия</div>
                                       <div className="flex items-center gap-2 text-gray-700">
                                         <Calendar className="h-3 w-3" />
                                         {formatDate(selectedModule.openAt)}
                                       </div>
                                     </div>
                                  )}

                                  {selectedModule.openAfterEvent && (
                                     <div className="space-y-1">
                                       <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Отложенный старт</div>
                                       <div className="text-gray-700">
                                         {selectedModule.openAfterAmount || 0} {selectedModule.openAfterUnit} после: <br/>
                                         <span className="font-medium">
                                            {selectedModule.openAfterEvent === 'track_definition_completed' ? 'Определения трека' :
                                             selectedModule.openAfterEvent === 'group_start_date' ? 'Старта группы' : selectedModule.openAfterEvent}
                                         </span>
                                       </div>
                                     </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>

                            <Tabs value={filterType} onValueChange={(v: any) => setFilterType(v)} className="w-[300px]">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="all">Все</TabsTrigger>
                                    <TabsTrigger value="open">Открыто</TabsTrigger>
                                    <TabsTrigger value="locked">Закрыто</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="bg-gray-50/50 px-4 py-2 text-xs font-medium text-gray-500 flex items-center border-b border-gray-100">
                             <div className="flex-1">Студент</div>
                             <div className="w-32">Трек / Тариф</div>
                             <div className="w-40 text-right">Статус доступа</div>
                        </div>

                        <ScrollArea className="flex-1">
                            {isLoading ? (
                                <div className="p-4 space-y-4">
                                    {[1,2,3,4,5].map(i => (
                                        <div key={i} className="flex items-center gap-4">
                                            <Skeleton className="h-10 w-10 rounded-full" />
                                            <div className="space-y-2 flex-1">
                                                <Skeleton className="h-4 w-1/3" />
                                                <Skeleton className="h-3 w-1/4" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {filteredData?.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            Студенты не найдены
                                        </div>
                                    ) : (
                                        filteredData?.map((record) => (
                                            <div key={record.user.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                                                <Avatar className="h-9 w-9 border border-gray-200">
                                                    <AvatarImage src={record.user.avatarUrl || undefined} />
                                                    <AvatarFallback className="bg-blue-50 text-blue-600">
                                                        {record.user.name?.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-900 truncate">
                                                        {record.user.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {record.user.email}
                                                    </div>
                                                </div>

                                                <div className="w-32 flex flex-col gap-1">
                                                    {record.user.track && (
                                                        <Badge variant="secondary" className="text-[10px] w-fit font-normal">
                                                            {record.user.track}
                                                        </Badge>
                                                    )}
                                                    {record.user.tariff && (
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            [{record.user.tariff}]
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="w-40 text-right shrink-0">
                                                    {getStatusBadge(record.access.reason, record.access.unlockDate)}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                        Выберите модуль слева
                    </div>
                )}
             </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
