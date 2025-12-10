"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

/**
 * Страница для автоматического восстановления аккаунта администратора
 * при прямом переходе на /admin во время impersonation
 */
export default function AdminRestorePage() {
  const router = useRouter();

  useEffect(() => {
    const restoreAdmin = async () => {
      try {
        await apiClient.post("/auth/impersonate/restore", {}, {
          withCredentials: true,
        });
        // После восстановления редиректим на админ-панель
        router.push("/admin");
      } catch (error) {
        console.error("Failed to restore admin account:", error);
        // Если не удалось восстановить, редиректим на главную
        router.push("/dashboard");
      }
    };

    restoreAdmin();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-lg text-gray-600">Восстановление аккаунта администратора...</p>
      </div>
    </div>
  );
}

