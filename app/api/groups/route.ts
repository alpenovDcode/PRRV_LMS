import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { createGroup, getGroups } from "@/lib/groups";
import { ApiResponse } from "@/types";
import { z } from "zod";

const createGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const user = verifyAccessToken(token);
    if (!user || (user.role !== "admin" && user.role !== "curator")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
    }

    const groups = await getGroups();

    return NextResponse.json<ApiResponse>({
      success: true,
      data: groups,
    });
  } catch (error) {
    console.error("Get groups error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const user = verifyAccessToken(token);
    if (!user || (user.role !== "admin" && user.role !== "curator")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
    }

    const body = await request.json();
    const data = createGroupSchema.parse(body);

    const group = await createGroup(data);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: group,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 400 });
    }
    console.error("Create group error:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } }, { status: 500 });
  }
}
