import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { submissionId } = await req.json();

    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { landingBlock: true }
    });

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // If already reviewed (by human or auto), return result
    if (submission.status === "approved" || submission.status === "rejected") {
      return NextResponse.json({ 
        status: "completed", 
        comment: submission.curatorComment 
      });
    }

    // Check if it's time for Auto-Review
    if (submission.autoResponseScheduledAt && new Date() > submission.autoResponseScheduledAt) {
      
      // PERORM AUTO REVIEW NOW
      const block = submission.landingBlock;
      let comment = "Отлично! Задание принято.";
      
      if (block && submission.responseTemplateIndex !== null) {
         const tpl = block.responseTemplates[submission.responseTemplateIndex];
         if (tpl) comment = tpl;
      }

      await prisma.homeworkSubmission.update({
        where: { id: submissionId },
        data: {
          status: "approved",
          curatorComment: comment,
          reviewedAt: new Date(),
          curatorId: null // System
        }
      });

      return NextResponse.json({ 
        status: "completed", 
        comment 
      });
    }

    // Still pending
    return NextResponse.json({ status: "pending" });

  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
