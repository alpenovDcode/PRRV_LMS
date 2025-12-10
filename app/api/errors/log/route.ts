import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-tracking";
import { z } from "zod";

const errorLogSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  severity: z.enum(["critical", "error", "warning", "info"]).optional(),
  metadata: z.record(z.any()).optional(),
  browserInfo: z.record(z.any()).optional(),
});

/**
 * POST /api/errors/log
 * Публичный endpoint для логирования ошибок с клиента
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = errorLogSchema.parse(body);

    // Добавляем user agent из headers если не передан
    if (!data.userAgent) {
      data.userAgent = request.headers.get("user-agent") || undefined;
    }

    const errorId = await logError(data);

    return NextResponse.json(
      {
        success: true,
        errorId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error logging error:", error);

    // Не возвращаем 500, чтобы не создавать цикл ошибок
    return NextResponse.json(
      {
        success: false,
        error: "Failed to log error",
      },
      { status: 200 } // Возвращаем 200 чтобы клиент не пытался повторить
    );
  }
}
