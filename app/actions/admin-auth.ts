"use server";

import { getCurrentUser } from "@/lib/session";
import { cookies } from "next/headers";

export async function verifyAdminDbAccess(password: string) {
  const user = await getCurrentUser();

  // 1. STRICT ROLE CHECK
  if (!user || user.role !== "admin") {
    // console.warn...
    return { success: false, error: "Access Denied: Admin role required." };
  }

  // 2. CHECK PASSWORD
  const envPassword = process.env.ADMIN_DB_PASSWORD;
  if (!envPassword) {
      console.error("ADMIN_DB_PASSWORD not set in env");
      return { success: false, error: "Server Configuration Error" };
  }

  if (password !== envPassword) {
     return { success: false, error: "Invalid Password" };
  }

  // 3. SET SECURE COOKIE
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour access

  (await cookies()).set("admin_db_unlocked", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: expires,
      path: "/admin", // Scope to admin
  });

  return { success: true };
}
