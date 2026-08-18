import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

const payloadSchema = z.object({
  assignments: z
    .array(
      z.object({
        curatorId: z.string().uuid(),
        role: z.enum(["primary", "assistant"]),
      })
    )
    .max(20)
    .refine((items) => new Set(items.map((item) => item.curatorId)).size === items.length, {
      message: "Куратор не может быть назначен дважды",
    })
    .refine((items) => items.filter((item) => item.role === "primary").length <= 1, {
      message: "У группы может быть только один основной куратор",
    }),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      const assignments = await db.curatorGroupAssignment.findMany({
        where: { groupId: id, isActive: true },
        select: {
          id: true,
          curatorId: true,
          role: true,
          curator: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      });
      return NextResponse.json({ success: true, data: assignments });
    },
    { roles: [UserRole.admin] }
  );
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const { assignments } = payloadSchema.parse(await request.json());

      const [group, curators] = await Promise.all([
        db.group.findUnique({ where: { id }, select: { id: true } }),
        db.user.findMany({
          where: { id: { in: assignments.map((item) => item.curatorId) }, role: UserRole.curator },
          select: { id: true },
        }),
      ]);
      if (!group) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Группа не найдена" } },
          { status: 404 }
        );
      }
      if (curators.length !== assignments.length) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_CURATOR", message: "Выбран некорректный куратор" },
          },
          { status: 400 }
        );
      }

      await db.$transaction(async (tx) => {
        await tx.curatorGroupAssignment.deleteMany({ where: { groupId: id } });
        if (assignments.length) {
          await tx.curatorGroupAssignment.createMany({
            data: assignments.map((item) => ({
              groupId: id,
              curatorId: item.curatorId,
              role: item.role,
              assignedById: req.user!.userId,
            })),
          });
        }
      });
      await logAction(req.user!.userId, "UPDATE_GROUP_CURATORS", "group", id, { assignments });
      return NextResponse.json({ success: true, data: assignments });
    },
    { roles: [UserRole.admin] }
  );
}
