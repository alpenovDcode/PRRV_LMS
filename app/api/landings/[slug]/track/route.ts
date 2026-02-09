
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const prisma = new PrismaClient();

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  try {
    const { slug } = await params;
    const cookieStore = await cookies();
    const cookieName = `landing_viewed_${slug}`;

    if (cookieStore.has(cookieName)) {
      return NextResponse.json({ message: "Already viewed" });
    }

    await prisma.landingPage.update({
      where: { slug },
      data: { views: { increment: 1 } },
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(cookieName, "true", {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Tracking error:", error);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
