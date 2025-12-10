"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  fullName?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      try {
        const response = await apiClient.get("/auth/me");
        return response.data.data;
      } catch {
        return null;
      }
    },
    retry: false,
    // Токены теперь в httpOnly cookies, проверяем только публичные страницы
    enabled: typeof window !== "undefined" && 
      !["/login", "/register", "/recover-password"].includes(window.location.pathname),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await apiClient.post("/auth/login", credentials, {
        withCredentials: true, // Важно для получения cookies
      });
      // Токены теперь автоматически устанавливаются в httpOnly cookies
      // Не нужно сохранять в localStorage
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      // Используем window.location для надежного редиректа с обновлением cookies
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        let redirectTo = urlParams.get("redirect");
        
        // Если нет redirect параметра, определяем по роли
        if (!redirectTo) {
          const userRole = data?.user?.role;
          if (userRole === "admin") {
            redirectTo = "/admin";
          } else if (userRole === "curator") {
            redirectTo = "/curator/inbox";
          } else {
            redirectTo = "/dashboard";
          }
        }
        
        // Небольшая задержка для установки cookies
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 100);
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiClient.post("/auth/register", data, {
        withCredentials: true, // Важно для получения cookies
      });
      // Токены теперь автоматически устанавливаются в httpOnly cookies
      // Не нужно сохранять в localStorage
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      router.push("/dashboard");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/auth/logout", {}, {
        withCredentials: true, // Важно для отправки cookies
      });
    },
    onSuccess: () => {
      // Cookies очищаются автоматически сервером
      // Не нужно очищать localStorage
      queryClient.clear();
      router.push("/login");
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}

