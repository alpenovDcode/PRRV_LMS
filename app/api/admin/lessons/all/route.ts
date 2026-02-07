import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const lessons = await prisma.lesson.findMany({
      select: {
        id: true,
        title: true,
        module: {
          select: {
            course: {
              select: {
                title: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json(lessons);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
