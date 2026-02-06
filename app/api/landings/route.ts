import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const landings = await prisma.landingPage.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(landings);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, slug } = await req.json();
    const landing = await prisma.landingPage.create({
      data: { title, slug },
    });
    return NextResponse.json(landing);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
