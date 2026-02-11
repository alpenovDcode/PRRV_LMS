
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;
    
    // Get Landing Page Views
    const landing = await prisma.landingPage.findUnique({
      where: { id },
      select: { views: true }
    });

    if (!landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }

    // Get Submissions with details
    const submissions = await prisma.homeworkSubmission.findMany({
      where: {
        landingBlock: {
          pageId: id
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        landingBlock: {
          select: {
            type: true,
            content: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Count
    const submissionsCount = submissions.length;

    // Process list (parse content JSON)
    const list = submissions.map(sub => {
       let parsedContent = null;
       try {
          parsedContent = sub.content ? JSON.parse(sub.content) : null;
       } catch (e) {
          parsedContent = sub.content;
       }
       return {
          id: sub.id,
          createdAt: sub.createdAt,
          user: sub.user,
          content: parsedContent,
          blockType: sub.landingBlock?.type
       };
    });

    return NextResponse.json({
      views: landing.views,
      submissions: submissionsCount,
      list
    });

  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
