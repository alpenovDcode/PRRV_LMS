import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { getGroup, updateGroup, deleteGroup } from "@/lib/groups";
import { ApiResponse } from "@/types";
import { z } from "zod";

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  courseId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = request.cookies.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const user = verifyAccessToken(token);
    if (!user) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const group = await getGroup(id);
    if (!group) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Group not found" } }, { status: 404 });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: group,
    });
  } catch (error) {
    console.error("Get group error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const data = updateGroupSchema.parse(body);

    // Convert startDate string to Date object if present
    const updateData: any = { ...data };
    if (data.startDate) {
      updateData.startDate = new Date(data.startDate);
    } else if (data.startDate === null) {
      updateData.startDate = null;
    }

    const group = await updateGroup(id, updateData);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: group,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 400 });
    }
    console.error("Update group error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    await deleteGroup(id);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { message: "Group deleted" },
    });
  } catch (error) {
    console.error("Delete group error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}
