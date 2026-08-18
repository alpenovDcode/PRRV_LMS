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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch("/notifications", { markAllAsRead: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch("/notifications", { notificationIds: [id] });
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
        <Button variant="ghost" size="icon" className="relative hover:bg-blue-50">
          <Bell className="h-5 w-5 text-blue-600" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white shadow-md">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[600px] w-96 overflow-y-auto border-slate-700 bg-slate-900 shadow-2xl"
      >
        <DropdownMenuLabel className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <span className="text-base font-semibold text-white">Уведомления</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-slate-800 hover:text-blue-300"
              onClick={(e) => {
                e.preventDefault();
                markAllReadMutation.mutate();
              }}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Прочитать все
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-700" />
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="mx-auto mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium text-slate-400">Нет новых уведомлений</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-2 border-b border-slate-800 p-4 transition-colors last:border-0 focus:bg-slate-800",
                !notification.isRead
                  ? "bg-slate-800/50 hover:bg-slate-800"
                  : "hover:bg-slate-800/30"
              )}
              onClick={(e) => {
                e.preventDefault();
                if (!notification.isRead) {
                  markAsReadMutation.mutate(notification.id);
                }
                if (notification.link) {
                  window.location.href = notification.link;
                }
              }}
            >
              <div className="flex w-full justify-between gap-3">
                <span
                  className={cn(
                    "text-sm font-semibold leading-tight",
                    !notification.isRead ? "text-white" : "text-slate-300"
                  )}
                >
                  {notification.title}
                </span>
                <span className="flex-shrink-0 whitespace-nowrap text-xs text-slate-500">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                    locale: ru,
                  })}
                </span>
              </div>
              <p
                className={cn(
                  "line-clamp-2 text-sm leading-relaxed",
                  !notification.isRead ? "text-slate-300" : "text-slate-400"
                )}
              >
                {notification.message}
              </p>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
