"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Layers,
  Settings,
  Bell,
  Menu,
  LogOut,
  Shield,
  Inbox,
  BarChart,
  AlertTriangle,
  TrendingUp,
  Film,
  GraduationCap,
} from "lucide-react";
import { useState } from "react";

const adminNavigation = [
  { name: "Обзор", href: "/admin", icon: LayoutDashboard },
  { name: "Курсы", href: "/admin/courses", icon: BookOpen },
  { name: "Пользователи", href: "/admin/users", icon: Users },
  { name: "Группы", href: "/admin/groups", icon: Layers },
  { name: "Видео-библиотека", href: "/admin/video-library", icon: Film },
  { name: "Входящие ДЗ", href: "/admin/homework", icon: Inbox },
  { name: "Уведомления", href: "/admin/notifications", icon: Bell },
  { name: "Аналитика", href: "/admin/analytics", icon: BarChart },
  { name: "Детальная аналитика", href: "/admin/analytics/detailed", icon: TrendingUp },
  { name: "Мониторинг", href: "/admin/monitoring/errors", icon: AlertTriangle },
  { name: "Тренинги", href: "/admin/trainings", icon: GraduationCap },
  { name: "Настройки", href: "/admin/settings", icon: Settings },
];

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// ... existing imports

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch pending homework count
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["admin-pending-homeworks"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/admin/homework?status=pending&limit=1");
        return data.data.total || data.data.length || 0;
      } catch (error) {
        return 0;
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-gradient-to-b from-white via-primary-50/30 to-white border-r border-primary/10 shadow-lg transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-6 border-b border-primary/10 bg-gradient-primary">
            <Link href="/admin" className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-black" />
              <span className="text-xl font-bold text-black">Прорыв Админ</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-4">
            {adminNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const isHomeworkItem = item.href === "/admin/homework";
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "gradient-primary text-white shadow-primary"
                      : "text-dark/70 hover:bg-primary/10 hover:text-primary hover:shadow-soft"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-primary")} />
                  <span className="flex-1">{item.name}</span>
                  {isHomeworkItem && pendingCount > 0 && (
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                      isActive ? "bg-white text-primary" : "bg-red-500 text-white"
                    )}>
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-primary/10 p-4 space-y-2 bg-gradient-to-t from-primary-50/50 to-transparent">
            <p className="truncate font-medium text-dark">{user?.fullName || user?.email}</p>
            <p className="truncate text-xs text-dark/60">{user?.email}</p>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start gap-2 text-dark/70 hover:text-accent hover:bg-accent/10"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-primary/10 bg-white/95 px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-soft">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden hover:bg-primary/10"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-primary" />
          </Button>

          <div className="flex flex-1 items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-dark/60">
              <span className="rounded-full gradient-primary px-3 py-1 text-white shadow-sm">
                Admin
              </span>
              <span>Панель управления</span>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-gradient-to-br from-primary-50/20 via-white to-white">{children}</main>
      </div>
    </div>
  );
}


