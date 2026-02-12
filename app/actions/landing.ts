"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function trackLandingView(slug: string) {
  if (!slug) return { error: "Slug is required" };

  try {
    const cookieStore = await cookies();
    const cookieName = `landing_viewed_${slug}`;

    // Check if already viewed
    if (cookieStore.has(cookieName)) {
      return { success: true, viewed: true };
    }

    // Increment view count
    await prisma.landingPage.update({
      where: { slug: decodeURIComponent(slug) },
      data: { views: { increment: 1 } },
    });

    // Set cookie
    cookieStore.set(cookieName, "true", {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    return { success: true, viewed: false };
  } catch (error) {
    console.error(`[VIEW_TRACK] SQL Error for ${slug}:`, error);
    return { error: "Failed to track view" };
  }
}
