import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { blocks } = await req.json();

    // Transaction: delete old blocks, create new ones (simplest sync strategy)
    // To preserve IDs (if needed) we would need more complex logic, but for now full replace is fine
    // EXCEPT we need to be careful if submissions link to blocks.
    // Ideally we should upsert.
    
    // For MVP: We will update existing by ID if present, create new if not.
    // Deleted blocks are harder. Let's try explicit upsert loop.
    
    // 1. Get current block IDs
    const currentBlocks = await prisma.landingBlock.findMany({
      where: { pageId: id },
      select: { id: true }
    });
    const currentIds = currentBlocks.map(b => b.id);
    
    // 2. Identify blocks to delete (present in DB but not in request)
    const incomingIds = blocks.map((b: any) => b.id).filter(Boolean);
    const idsToDelete = currentIds.filter(dbId => !incomingIds.includes(dbId));

    // 3. Prepare transaction operations
    const ops = [];

    // Delete removed blocks
    if (idsToDelete.length > 0) {
      ops.push(prisma.landingBlock.deleteMany({
        where: { id: { in: idsToDelete } }
      }));
    }

    // Upsert (Update or Create) remaining blocks
    blocks.forEach((block: any, index: number) => {
      if (block.id) {
         ops.push(prisma.landingBlock.update({
            where: { id: block.id },
            data: {
               lessonId: block.lessonId || null,
               type: block.type,
               content: block.content,
               settings: block.settings,
               responseTemplates: block.responseTemplates || [],
               orderIndex: index
            }
         }));
      } else {
         ops.push(prisma.landingBlock.create({
            data: {
               pageId: id,
               lessonId: block.lessonId || null,
               type: block.type,
               content: block.content,
               settings: block.settings,
               responseTemplates: block.responseTemplates || [],
               orderIndex: index
            }
         }));
      }
    });

    await prisma.$transaction(ops);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
