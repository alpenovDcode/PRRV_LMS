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
  MessageSquare,
  MessageCircle,
  Send,
  Award,
  Mail,
  Plus,
  Bot,
} from "lucide-react";
import { useState } from "react";

const adminNavigation = [
  { name: "Обзор", href: "/admin", icon: LayoutDashboard },
  { name: "Курсы", href: "/admin/courses", icon: BookOpen },
  { name: "Пользователи", href: "/admin/users", icon: Users },
  { name: "Группы", href: "/admin/groups", icon: Layers },
  { name: "Видео-библиотека", href: "/admin/video-library", icon: Film },
  { name: "Входящие ДЗ", href: "/admin/homework", icon: Inbox },
  { name: "Вопросы наставникам", href: "/admin/questions", icon: MessageCircle },
  { name: "Статистика вопросов", href: "/admin/questions/stats", icon: BarChart },
  { name: "Обсуждения", href: "/admin/comments", icon: MessageSquare },
  { name: "Уведомления", href: "/admin/notifications", icon: Bell },
  { name: "Рассылки", href: "/admin/broadcasts", icon: Send },
  { name: "Боты (Telegram)", href: "/admin/bots", icon: Bot },
  { name: "Аналитика", href: "/admin/analytics", icon: BarChart },
  { name: "Детальная аналитика", href: "/admin/analytics/detailed", icon: TrendingUp },
  { name: "Мониторинг", href: "/admin/monitoring/errors", icon: AlertTriangle },
  { name: "Тренинги", href: "/admin/trainings", icon: GraduationCap },
  { name: "Сертификаты", href: "/admin/certificates", icon: Award },
  { name: "Email шаблоны", href: "/admin/email-templates", icon: Mail },
  { name: "Лендинги", href: "/admin/landings", icon: LayoutDashboard }, // Using LayoutDashboard temporarily or until a better icon is imported
  { name: "Настройки", href: "/admin/settings", icon: Settings }
];

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import AIAssistant from "@/components/ai/AIAssistant";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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
          "fixed inset-y-0 left-0 z-50 transform bg-gradient-to-b from-white via-primary-50/30 to-white border-r border-primary/10 shadow-lg transition-all duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex h-full flex-col">
          <div className={cn(
            "flex h-16 items-center border-b border-primary/10 bg-gradient-primary transition-all duration-300 px-4",
            isCollapsed ? "justify-center" : "justify-between px-6"
          )}>
            <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
              <Shield className="h-6 w-6 text-black shrink-0" />
              {!isCollapsed && <span className="text-xl font-bold text-black animate-in fade-in duration-300">Прорыв Админ</span>}
            </Link>
            {!isCollapsed && (
              <button 
                onClick={() => setIsCollapsed(true)}
                className="hidden lg:flex p-1 hover:bg-black/5 rounded-lg text-black/50"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>

          <nav className="flex-1 space-y-2 px-3 py-4 overflow-y-auto thin-scrollbar">
            {isCollapsed && (
              <button 
                onClick={() => setIsCollapsed(false)}
                className="hidden lg:flex w-full items-center justify-center p-3 mb-4 text-primary hover:bg-primary/10 rounded-xl transition-all"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            {adminNavigation.filter(item => {
               // If user is admin (or not curator), show all
               if (user?.role !== "curator") return true;
               
               // If curator, allow only specific paths
               const allowed = [
                 "/admin",
                 "/admin/courses",
                 "/admin/users",
                 "/admin/groups",
                 "/admin/homework",
                 "/admin/comments",
                 "/admin/trainings"
               ];
               return allowed.includes(item.href);
            }).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const isHomeworkItem = item.href === "/admin/homework";
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-xl p-3 text-sm font-medium transition-all duration-200 group relative",
                    isActive
                      ? "gradient-primary text-white shadow-primary"
                      : "text-dark/70 hover:bg-primary/10 hover:text-primary hover:shadow-soft",
                    isCollapsed ? "justify-center" : "gap-3 px-4"
                  )}
                  onClick={() => setSidebarOpen(false)}
                  title={isCollapsed ? item.name : ""}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-primary")} />
                  {!isCollapsed && <span className="flex-1 animate-in fade-in slide-in-from-left-2 duration-300">{item.name}</span>}
                  
                  {isHomeworkItem && pendingCount > 0 && (
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
                      isActive ? "bg-white text-primary" : "bg-red-500 text-white",
                      isCollapsed && "absolute -top-1 -right-1 ring-2 ring-white"
                    )}>
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className={cn(
            "border-t border-primary/10 p-4 space-y-2 bg-gradient-to-t from-primary-50/50 to-transparent transition-all overflow-hidden",
            isCollapsed ? "items-center flex flex-col" : ""
          )}>
            {!isCollapsed ? (
              <>
                <p className="truncate font-medium text-dark">{user?.fullName || user?.email}</p>
                <p className="truncate text-xs text-dark/60">{user?.email}</p>
              </>
            ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] text-white font-bold">
                   {user?.fullName?.charAt(0) || user?.email?.charAt(0)}
                </div>
            )}
            <Button
              variant="ghost"
              className={cn(
                "mt-2 w-full justify-start gap-2 text-dark/70 hover:text-accent hover:bg-accent/10 transition-all",
                isCollapsed ? "p-0 h-10 w-10 justify-center" : ""
              )}
              onClick={() => logout()}
              title={isCollapsed ? "Выйти" : ""}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>Выйти</span>}
            </Button>
          </div>
        </div>
      </aside>

      <div className={cn(
        "flex flex-1 flex-col transition-all duration-300",
        isCollapsed ? "lg:pl-20" : "lg:pl-64"
      )}>
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
            {isCollapsed && (
               <button 
                  onClick={() => setIsCollapsed(false)}
                  className="hidden lg:flex items-center gap-2 text-primary hover:text-primary-foreground hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all text-sm font-medium"
               >
                  <Plus className="h-4 w-4" />
                  Развернуть меню
               </button>
            )}
          </div>
        </header>

        <main className="flex-1 bg-gradient-to-br from-primary-50/20 via-white to-white overflow-x-hidden p-4 md:p-8">
           {children}
        </main>
      </div>
      <AIAssistant />
    </div>
  );
}


