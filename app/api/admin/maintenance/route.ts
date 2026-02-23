import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { getRedisClient } from "@/lib/redis";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

const MAINTENANCE_KEY = "system:maintenance";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const redis = await getRedisClient();
        const isMaintenance = await redis.get(MAINTENANCE_KEY);
        
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { isMaintenance: isMaintenance === "true" },
        });
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to check status" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (_) => {
      try {
        const body = await request.json();
        const { enabled } = body;
        
        const redis = await getRedisClient();
        
        if (enabled) {
          await redis.set(MAINTENANCE_KEY, "true");
        } else {
          await redis.del(MAINTENANCE_KEY);
        }

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { isMaintenance: !!enabled },
        });
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update status" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
