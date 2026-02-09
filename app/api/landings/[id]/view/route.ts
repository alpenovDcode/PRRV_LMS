
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const prisma = new PrismaClient();

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id: slug } = params; // treat id as slug
    console.log(`[VIEW_TRACK] Request for slug: ${slug}`);

    const cookieStore = await cookies();
    const cookieName = `landing_viewed_${slug}`;

    if (cookieStore.has(cookieName)) {
      console.log(`[VIEW_TRACK] Cookie found for ${slug}, skipping increment`);
      return NextResponse.json({ message: "Already viewed" });
    }

    console.log(`[VIEW_TRACK] Incrementing view for ${slug}`);
    await prisma.landingPage.update({
      where: { slug: decodeURIComponent(slug) },
      data: { views: { increment: 1 } },
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(cookieName, "true", {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });
    
    console.log(`[VIEW_TRACK] View counted and cookie set for ${slug}`);
    return response;
  } catch (error) {
    console.error("[VIEW_TRACK] Tracking error:", error);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
