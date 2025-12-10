import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { getRedisClient } from "@/lib/redis";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

const SETTINGS_KEY = "system:settings";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const redis = await getRedisClient();
        const settingsJson = await redis.get(SETTINGS_KEY);
        const settings = settingsJson ? JSON.parse(settingsJson) : {};
        
        return NextResponse.json<ApiResponse>({
          success: true,
          data: settings,
        });
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch settings" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (_) => {
      try {
        const body = await request.json();
        const redis = await getRedisClient();
        
        await redis.set(SETTINGS_KEY, JSON.stringify(body));

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Settings saved" },
        });
      } catch (error) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to save settings" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
