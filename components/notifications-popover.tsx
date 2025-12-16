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
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center shadow-md">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[600px] overflow-y-auto bg-slate-900 border-slate-700 shadow-2xl">
        <DropdownMenuLabel className="flex items-center justify-between py-3 px-4 border-b border-slate-700">
          <span className="text-base font-semibold text-white">Уведомления</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-slate-800"
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
            <Bell className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">Нет новых уведомлений</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                "flex flex-col items-start gap-2 p-4 cursor-pointer border-b border-slate-800 last:border-0 transition-colors focus:bg-slate-800",
                !notification.isRead 
                  ? "bg-slate-800/50 hover:bg-slate-800" 
                  : "hover:bg-slate-800/30"
              )}
              onClick={(e) => {
                e.preventDefault();
                if (!notification.isRead) {
                  markAsReadMutation.mutate(notification.id);
                }
              }}
            >
              <div className="flex w-full justify-between gap-3">
                <span className={cn(
                  "font-semibold text-sm leading-tight",
                  !notification.isRead ? "text-white" : "text-slate-300"
                )}>
                  {notification.title}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                    locale: ru,
                  })}
                </span>
              </div>
              <p className={cn(
                "text-sm line-clamp-2 leading-relaxed",
                !notification.isRead ? "text-slate-300" : "text-slate-400"
              )}>
                {notification.message}
              </p>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
