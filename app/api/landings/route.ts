import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      try {
        const landings = await prisma.landingPage.findMany({
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(landings);
      } catch (error) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      try {
        const { title, slug } = await req.json();
        const landing = await prisma.landingPage.create({
          data: { title, slug },
        });
        return NextResponse.json(landing);
      } catch (error: any) {
        console.error("Create landing error:", error);
        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "Лендинг с таким URL уже существует" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "Failed to create: " + error.message },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
