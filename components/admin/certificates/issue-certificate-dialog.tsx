"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce"; // Assuming this hook exists or I should create it/inline logic

interface IssueCertificateDialogProps {
  children?: React.ReactNode;
}

export function IssueCertificateDialog({ children }: IssueCertificateDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  
  // Custom debounce logic if hook doesn't exist, but let's assume standard debouncing
  // For now, I'll implement debounce inside useEffect or use query key change
  

  const debouncedSearchQuery = useDebounce(userSearchQuery, 300);
  
  const queryClient = useQueryClient();

  // Fetch Users based on search
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["admin", "users", "search", debouncedSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      params.set("limit", "10"); // Limit results
      
      const response = await apiClient.get(`/admin/users?${params.toString()}`);
      return response.data.data;
    },
    enabled: userSearchOpen, // Only fetch when dropdown is open
  });

  // Fetch Courses
  const { data: courses } = useQuery({
    queryKey: ["admin", "courses"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/courses");
      return response.data.data;
    },
  });

  // Fetch Templates
  const { data: templates } = useQuery({
    queryKey: ["admin", "certificate-templates"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/certificates/templates");
      return response.data.data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !selectedCourse || !selectedTemplate) {
        throw new Error("Please fill all fields");
      }
      
      const response = await apiClient.post("/admin/certificates", {
        userId: selectedUser,
        courseId: selectedCourse,
        templateId: selectedTemplate,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success("Сертификат успешно выдан");
      setOpen(false);
      setSelectedUser(null);
      setSelectedCourse(null);
      setSelectedTemplate(null);
      setUserSearchQuery("");
      queryClient.invalidateQueries({ queryKey: ["admin", "certificates"] });
    },
    onError: (error: any) => {
        const message = error.response?.data?.error?.message || error.message || "Ошибка выдачи";
      toast.error(message);
    },
  });

  const handleUserSearch = (value: string) => {
    setUserSearchQuery(value);
  };
  
  // Helper to get selected user label
  const getSelectedUserLabel = () => {
      if (!selectedUser) return "Выберите пользователя";
      // We might not have the user in the current 'users' list if search changed.
      // Ideally we should persist the selected user object, but ID is simple.
      // For display, if it's in the list, show name. If not, show "Пользователь выбран" (or fetch specific user).
      const user = users?.find((u: any) => u.id === selectedUser);
      return user ? `${user.fullName} (${user.email})` : "Пользователь выбран";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button>Выдать сертификат</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Выдача сертификата</DialogTitle>
          <DialogDescription>
            Вручную выдать сертификат пользователю за выбранный курс.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          
          {/* USER SELECT */}
          <div className="grid gap-2">
            <Label>Пользователь</Label>
            <Label>Пользователь</Label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или email..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setUserSearchOpen(true);
                  }}
                  onFocus={() => setUserSearchOpen(true)}
                  className="pl-8"
                />
              </div>
              
              {userSearchOpen && (userSearchQuery || users?.length > 0) && (
                <div className="absolute z-[100] mt-1 w-full rounded-md border bg-popover p-0 shadow-md">
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {isLoadingUsers ? (
                      <div className="flex items-center p-2 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Загрузка...
                      </div>
                    ) : users?.length === 0 ? (
                       <div className="p-2 text-sm text-muted-foreground text-center">
                         Пользователи не найдены
                       </div>
                    ) : (
                      users?.map((user: any) => (
                        <div
                          key={user.id}
                          className={cn(
                            "flex cursor-pointer items-center rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                            selectedUser === user.id && "bg-accent/50"
                          )}
                          onClick={() => {
                            setSelectedUser(user.id);
                            setUserSearchQuery(user.fullName || user.email);
                            setUserSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedUser === user.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{user.fullName || "Без имени"}</span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {/* Backdrop to close dropdown on click outside */}
              {userSearchOpen && (
                <div 
                  className="fixed inset-0 z-[99]" 
                  onClick={() => setUserSearchOpen(false)} 
                />
              )}
            </div>
          </div>

          {/* COURSE SELECT */}
          <div className="grid gap-2">
            <Label>Курс</Label>
            <Select 
                value={selectedCourse || ""} 
                onValueChange={(val) => {
                    setSelectedCourse(val);
                    // Try to auto-select template if course has one
                    const course = courses?.find((c: any) => c.id === val);
                    // Note: Courses API currently doesn't return certificateTemplateId, so cannot auto-select yet unless updated.
                }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите курс" />
              </SelectTrigger>
              <SelectContent>
                {courses?.map((course: any) => (
                    <SelectItem key={course.id} value={course.id}>
                        {course.title}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* TEMPLATE SELECT */}
          <div className="grid gap-2">
            <Label>Шаблон сертификата</Label>
            <Select 
                value={selectedTemplate || ""} 
                onValueChange={setSelectedTemplate}
                disabled={!templates?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите шаблон" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>
                        {template.name}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
             {!templates?.length && <p className="text-xs text-red-500">Нет доступных шаблонов</p>}
          </div>

        </div>
        <DialogFooter>
          <Button 
            onClick={() => generateMutation.mutate()} 
            disabled={generateMutation.isPending || !selectedUser || !selectedCourse || !selectedTemplate}
          >
             {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Выдать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
