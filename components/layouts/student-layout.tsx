"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Home,
  Menu,
  LogOut,
  X,
  Settings,
  Shield,
  Calendar,
  FileText,
  MessageCircle,
  ClipboardList,
} from "lucide-react";
import { useState, useEffect } from "react";
import { NotificationsPopover } from "@/components/notifications-popover";
import { apiClient } from "@/lib/api-client";
import { LearningActionBanner } from "@/components/learning-action-banner";

// Пункт `requiredTariffs` ограничивает видимость для не-LR тарифов.
// Если поле не задано — пункт виден всем. Админы видят всё.
const navigation: Array<{
  name: string;
  href: string;
  icon: typeof Home;
  requiredTariffs?: Array<"VR" | "LR" | "SR">;
}> = [
  { name: "Главная", href: "/dashboard", icon: Home },
  { name: "Мои материалы", href: "/courses", icon: BookOpen },
  { name: "Календарь", href: "/dashboard/calendar", icon: Calendar },
  { name: "Домашнее задание", href: "/dashboard/homework", icon: FileText },
  {
    name: "Бриф для упаковки",
    href: "/dashboard/brief",
    icon: ClipboardList,
    requiredTariffs: ["LR"],
  },
  { name: "Вопросы наставнику", href: "/dashboard/questions", icon: MessageCircle },
  { name: "Настройки профиля", href: "/profile", icon: Settings },
];

export function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasImpersonation, setHasImpersonation] = useState(false);

  // Проверяем наличие originalAdminToken (impersonation) через API
  useEffect(() => {
    const checkImpersonation = async () => {
      try {
        const response = await apiClient.get("/auth/impersonate/check");

        const isImpersonating = response.data.data.isImpersonating;

        setHasImpersonation(isImpersonating);
      } catch (error) {
        setHasImpersonation(false);
      }
    };

    checkImpersonation();
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform border-r border-primary/10 bg-gradient-to-b from-white via-primary-50/30 to-white shadow-lg transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="bg-gradient-primary flex h-16 items-center justify-between border-b border-primary/10 px-6">
            <Link href="/dashboard" className="text-3xl font-bold text-orange-500">
              Прорыв
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
            {navigation
              // Скрываем пункты, недоступные на текущем тарифе. Админы
              // видят всё, плюс пункт виден если у него нет ограничения.
              .filter((item) => {
                if (!item.requiredTariffs) return true;
                if (user?.role === "admin") return true;
                if (!user?.tariff) return false;
                return item.requiredTariffs.includes(user.tariff as "VR" | "LR" | "SR");
              })
              .map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "gradient-primary text-white shadow-primary"
                        : "hover:shadow-soft text-dark/70 hover:bg-primary/10 hover:text-primary"
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon
                      className={cn("h-5 w-5", isActive ? "text-white" : "text-primary")}
                    />
                    {item.name}
                  </Link>
                );
              })}

            {/* Admin Panel Link - показываем если есть originalAdminToken (impersonation) */}
            {hasImpersonation && (
              <button
                onClick={async () => {
                  try {
                    // Восстанавливаем оригинальный аккаунт администратора
                    await apiClient.post(
                      "/auth/impersonate/restore",
                      {},
                      {
                        withCredentials: true,
                      }
                    );
                    // Редирект на админ-панель
                    window.location.href = "/admin";
                  } catch (error) {
                    // Если не удалось восстановить, просто редиректим (может быть обычный админ)
                    window.location.href = "/admin";
                  }
                }}
                className="mt-2 flex w-full items-center gap-3 rounded-xl border border-red-100 px-4 py-3 text-sm font-medium text-red-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700"
              >
                <Shield className="h-5 w-5" />
                Вернуться в админ-панель
              </button>
            )}
            {/* Admin Panel Link для обычных админов (не в режиме impersonation) */}
            {user?.role === "admin" && !hasImpersonation && (
              <Link
                href="/admin"
                className="mt-2 flex items-center gap-3 rounded-xl border border-red-100 px-4 py-3 text-sm font-medium text-red-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700"
              >
                <Shield className="h-5 w-5" />
                Админ-панель
              </Link>
            )}
          </nav>

          {/* User profile section */}
          <div className="border-t border-primary/10 bg-gradient-to-t from-primary-50/50 to-transparent p-4">
            <div className="mb-3 flex items-center gap-3 px-2">
              <div className="gradient-primary relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName || "User"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-dark">
                  {user?.fullName || "Пользователь"}
                </p>
                <p className="truncate text-xs text-dark/60">
                  {user?.role === "student" ? "Студент" : user?.role || "Пользователь"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-dark/70 hover:bg-accent/10 hover:text-accent"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Header */}
        <header className="shadow-soft sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-primary/10 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-primary/10 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-primary" />
          </Button>

          <div className="flex flex-1 items-center justify-end gap-4">
            <NotificationsPopover />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 bg-gradient-to-br from-primary-50/20 via-white to-white">
          <LearningActionBanner />
          {children}
        </main>
      </div>
      {/* Floating Stop Impersonation / Return to Admin Button */}
      {(hasImpersonation || user?.role === "admin") && (
        <div className="fixed bottom-6 right-6 z-50 duration-300 animate-in fade-in slide-in-from-bottom-4">
          <Button
            onClick={async () => {
              if (hasImpersonation) {
                try {
                  await apiClient.post(
                    "/auth/impersonate/restore",
                    {},
                    {
                      withCredentials: true,
                    }
                  );
                  window.location.href = "/admin";
                } catch (error) {
                  window.location.href = "/admin";
                }
              } else {
                window.location.href = "/admin";
              }
            }}
            className="h-auto gap-2 rounded-full bg-blue-500 px-6 py-6 text-white shadow-lg transition-all hover:scale-105 hover:bg-blue-600 hover:shadow-xl"
          >
            <Shield className="h-5 w-5" />
            <span className="font-medium">Вернуться в админку</span>
          </Button>
        </div>
      )}
    </div>
  );
}
