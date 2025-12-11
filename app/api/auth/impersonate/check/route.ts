import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { verifyAccessTokenEdge } from "@/lib/auth-edge";

/**
 * GET /api/auth/impersonate/check
 * Проверить, активна ли сессия impersonation
 */
export async function GET(request: NextRequest) {
  try {
    const originalAdminToken = request.cookies.get("originalAdminToken")?.value;
    const accessToken = request.cookies.get("accessToken")?.value;
    


    if (!originalAdminToken) {

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            isImpersonating: false,
          },
        },
        { status: 200 }
      );
    }

    const adminPayload = await verifyAccessTokenEdge(originalAdminToken);


    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          isImpersonating: !!adminPayload && adminPayload.role === "admin",
          adminId: adminPayload?.userId,
        },
      },
      { status: 200 }
    );
  } catch (error) {

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          isImpersonating: false,
        },
      },
      { status: 200 }
    );
  }
}

