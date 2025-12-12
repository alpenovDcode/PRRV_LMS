import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Cleanup expired and used login tokens
 * Can be called manually or via cron job
 */
export async function POST(req: NextRequest) {
  try {
    const now = new Date();
    
    // Delete expired tokens (older than 24 hours)
    const expiredTokens = await prisma.loginToken.deleteMany({
      where: {
        OR: [
          // Expired tokens
          { expiresAt: { lt: now } },
          // Used tokens older than 1 hour
          {
            used: true,
            usedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
          },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: expiredTokens.count,
      message: `Deleted ${expiredTokens.count} expired/used tokens`,
    });
  } catch (error) {
    console.error("Error cleaning up login tokens:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Allow GET for cron jobs
export async function GET(req: NextRequest) {
  return POST(req);
}
