
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Update lastActiveAt
    await db.user.update({
      where: { id: user.userId }, // Access userId from JWTPayload
      data: {
        lastActiveAt: new Date(),
      },
      select: { id: true }, // Optimization: select only id
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating activity:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
