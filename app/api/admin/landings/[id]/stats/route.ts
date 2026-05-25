import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await props.params;

        const landing = await db.landingPage.findUnique({
          where: { id },
          select: { views: true },
        });

        if (!landing) {
          return NextResponse.json(
            { error: "Landing not found" },
            { status: 404 }
          );
        }

        const submissions = await db.homeworkSubmission.findMany({
          where: { landingBlock: { pageId: id } },
          include: {
            user: { select: { id: true, email: true, fullName: true } },
            landingBlock: { select: { type: true, content: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        const list = submissions.map((sub) => {
          let parsedContent = null;
          try {
            parsedContent = sub.content ? JSON.parse(sub.content) : null;
          } catch {
            parsedContent = sub.content;
          }
          return {
            id: sub.id,
            createdAt: sub.createdAt,
            user: sub.user,
            content: parsedContent,
            blockType: sub.landingBlock?.type,
          };
        });

        return NextResponse.json({
          views: landing.views,
          submissions: submissions.length,
          list,
        });
      } catch (error) {
        console.error("Stats error:", error);
        return NextResponse.json(
          { error: "Failed to fetch stats" },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
