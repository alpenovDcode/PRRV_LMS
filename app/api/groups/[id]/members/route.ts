import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { addMemberToGroup } from "@/lib/groups";
import { ApiResponse } from "@/types";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = request.cookies.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const user = verifyAccessToken(token);
    if (!user || (user.role !== "admin" && user.role !== "curator")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = addMemberSchema.parse(body);

    await addMemberToGroup(id, userId);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { message: "Member added" },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 400 });
    }
    if (error instanceof Error && error.message === "User is already a member of this group") {
      return NextResponse.json({ success: false, error: { code: "CONFLICT", message: error.message } }, { status: 409 });
    }
    console.error("Add group member error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}
