"use client";

import { AdminLayout } from "@/components/layouts/admin-layout";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { useAuth } from "@/hooks/use-auth";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  if (user?.role === "curator") {
    return <CuratorLayout>{children}</CuratorLayout>;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
