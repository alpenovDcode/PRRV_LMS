
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    
    // Get Landing Page Views
    const landing = await prisma.landingPage.findUnique({
      where: { id },
      select: { views: true }
    });

    if (!landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }

    // Get Submission Count (Unique users or total submissions?)
    // Let's count total submissions for now
    const submissionsCount = await prisma.homeworkSubmission.count({
      where: {
        landingBlock: {
          pageId: id
        }
      }
    });

    return NextResponse.json({
      views: landing.views,
      submissions: submissionsCount
    });

  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
