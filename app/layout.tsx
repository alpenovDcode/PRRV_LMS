import type { Metadata } from "next";
// import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// const inter = Inter({ subsets: ["latin", "cyrillic"] });
const inter = { className: "font-sans" }; // Use system font fallback

export const metadata: Metadata = {
  title: "PRRV",
  description: "Платформа для онлайн-обучения",
};

import { headers, cookies } from "next/headers";
import { getRedisClient } from "@/lib/redis";
import MaintenancePage from "@/app/maintenance/page";
import { verifyAccessToken } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { ErrorTrackingInit } from "@/components/error-tracking-init";

// Force dynamic rendering since we use headers() and cookies()
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Maintenance mode check
  let isMaintenanceMode = false;
  try {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") || "";
    
    // Allow access to maintenance page itself, api routes, and static files (handled by middleware matcher mostly)
    // Also allow login/register/recover-password to let admins sign in
    const allowedPaths = [
      "/maintenance", 
      "/api", 
      "/_next", 
      "/favicon.ico",
      "/login",
      "/register",
      "/recover-password",
      "/legal"
    ];

    const isAllowedPath = allowedPaths.some(path => pathname.startsWith(path));

    if (!isAllowedPath) {
      const redis = await getRedisClient();
      const isMaintenance = await redis.get("system:maintenance");

      if (isMaintenance === "true") {
        // Check if user is admin
        const token = (await cookies()).get("accessToken")?.value;
        let isAdmin = false;

        if (token) {
          const payload = verifyAccessToken(token);
          if (payload && payload.role === UserRole.admin) {
            isAdmin = true;
          }
        }

        if (!isAdmin) {
          return (
            <html lang="ru" suppressHydrationWarning>
              <body className={inter.className}>
                <MaintenancePage />
              </body>
            </html>
          );
        }
      }
    }
  } catch (error) {
    console.error("Maintenance check failed:", error);
    // Continue rendering if check fails (fail open)
  }

  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <ErrorTrackingInit />
          {(await cookies()).get("originalAdminToken")?.value && <ImpersonationBanner />}
          <ErrorBoundary>{children}</ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}

