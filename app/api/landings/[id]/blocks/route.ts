import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await params;
        const blocks = await prisma.landingBlock.findMany({
          where: { pageId: id },
          orderBy: { orderIndex: "asc" },
        });
        return NextResponse.json(blocks);
      } catch (error) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await params;
        const { blocks } = await req.json();

        // 1. Get current block IDs
        const currentBlocks = await prisma.landingBlock.findMany({
          where: { pageId: id },
          select: { id: true },
        });
        const currentIds = currentBlocks.map((b) => b.id);

        // 2. Identify blocks to delete (present in DB but not in request)
        const incomingIds = blocks.map((b: any) => b.id).filter(Boolean);
        const idsToDelete = currentIds.filter(
          (dbId) => !incomingIds.includes(dbId)
        );

        // 3. Prepare transaction operations
        const ops: any[] = [];

        if (idsToDelete.length > 0) {
          ops.push(
            prisma.landingBlock.deleteMany({ where: { id: { in: idsToDelete } } })
          );
        }

        blocks.forEach((block: any, index: number) => {
          const blockData = {
            lessonId: block.lessonId || null,
            type: block.type,
            content: block.content,
            design: block.design,
            settings: block.settings,
            responseTemplates: block.responseTemplates || [],
            orderIndex: index,
          };

          if (block.id) {
            ops.push(
              prisma.landingBlock.upsert({
                where: { id: block.id },
                update: blockData,
                create: { id: block.id, pageId: id, ...blockData },
              })
            );
          } else {
            ops.push(
              prisma.landingBlock.create({ data: { pageId: id, ...blockData } })
            );
          }
        });

        await prisma.$transaction(ops);
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
