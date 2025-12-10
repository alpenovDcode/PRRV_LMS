import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { removeMemberFromGroup } from "@/lib/groups";
import { ApiResponse } from "@/types";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params;
    const token = request.cookies.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const user = verifyAccessToken(token);
    if (!user || (user.role !== "admin" && user.role !== "curator")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
    }

    await removeMemberFromGroup(id, userId);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { message: "Member removed" },
    });
  } catch (error) {
    console.error("Remove group member error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}
