import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await params;
        const landing = await prisma.landingPage.findUnique({ where: { id } });
        if (!landing)
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(landing);
      } catch (error) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await params;
        const body = await req.json();
        const landing = await prisma.landingPage.update({
          where: { id },
          data: {
            title: body.title,
            slug: body.slug,
            isPublished: body.isPublished,
            settings: body.settings ?? undefined,
          },
        });
        return NextResponse.json(landing);
      } catch (error: any) {
        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "Лендинг с таким URL уже существует" },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      try {
        const { id } = await params;
        await prisma.landingPage.delete({ where: { id } });
        return NextResponse.json({ success: true });
      } catch (error) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
