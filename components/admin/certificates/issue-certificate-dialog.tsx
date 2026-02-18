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
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
            <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={userSearchOpen}
                  className="w-full justify-between"
                >
                  {getSelectedUserLabel()}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Поиск по имени или email..." 
                    value={userSearchQuery}
                    onValueChange={handleUserSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Пользователи не найдены.</CommandEmpty>
                    <CommandGroup>
                        {isLoadingUsers && (
                            <CommandItem disabled>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка...
                            </CommandItem>
                        )}
                        {!isLoadingUsers && users?.map((user: any) => (
                        <CommandItem
                          key={user.id}
                          value={user.id}
                          onSelect={(currentValue) => {
                            // currentValue in cmdk is the value prop (lowercased typically, but we should use the ID)
                            // If we rely on closure, we can just use user.id
                            setSelectedUser(user.id);
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
                              <span>{user.fullName || "Без имени"}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
