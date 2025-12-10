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
    
    console.log("[IMPERSONATE CHECK] Cookies:", {
      hasOriginalAdminToken: !!originalAdminToken,
      hasAccessToken: !!accessToken,
      originalTokenLength: originalAdminToken?.length,
      accessTokenLength: accessToken?.length,
      allCookies: request.cookies.getAll().map(c => c.name),
    });

    if (!originalAdminToken) {
      console.log("[IMPERSONATE CHECK] No originalAdminToken found - not impersonating");
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
    console.log("[IMPERSONATE CHECK] Admin payload:", {
      hasPayload: !!adminPayload,
      role: adminPayload?.role,
      userId: adminPayload?.userId,
    });

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
    console.error("[IMPERSONATE CHECK] Error:", error);
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

