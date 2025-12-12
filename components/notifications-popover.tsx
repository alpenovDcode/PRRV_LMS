"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationsPopover() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/notifications");
        return response.data.data; // Returns { notifications: [], unreadCount: number }
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
        return { notifications: [], unreadCount: 0 };
      }
    },
    // Poll every 5 seconds for better responsiveness
    refetchInterval: 5000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch("/notifications", { markAllAsRead: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-primary/10">
          <Bell className="h-5 w-5 text-primary" /> 
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[500px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Уведомления</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-primary"
              onClick={(e) => {
                e.preventDefault();
                markAllReadMutation.mutate();
              }}
            >
              <Check className="mr-1 h-3 w-3" />
              Прочитать все
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Нет новых уведомлений
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                "flex flex-col items-start gap-1 p-3 cursor-pointer",
                !notification.isRead && "bg-blue-50/50"
              )}
              asChild
            >
              <Link href={notification.link || "#"}>
                <div className="flex w-full justify-between gap-2">
                  <span className="font-medium text-sm">{notification.title}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {notification.message}
                </p>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
