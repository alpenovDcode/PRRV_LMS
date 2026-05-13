// Telegram media proxy. Resolves a file_id via the bot's token, then
// streams the bytes through this server so we never expose the bot
// token in a browser-visible 302 Location header.
//
// Cache-Control allows the browser to reuse the bytes for an hour
// (Telegram's file URLs are stable for ~60 min after getFile).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { getTelegramFilePath, guessContentType } from "@/lib/tg/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROXY_BYTES = 20 * 1024 * 1024; // 20MB

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; fileId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: { id: true, tokenEncrypted: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Bot not found" } },
          { status: 404 }
        );
      }

      const resolved = await getTelegramFilePath(bot.tokenEncrypted, params.fileId);
      if (!resolved) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TG_FILE_UNAVAILABLE",
              message: "Telegram отказался отдавать файл (возможно, истёк срок жизни file_id)",
            },
          },
          { status: 410 }
        );
      }
      if (resolved.fileSize !== null && resolved.fileSize > MAX_PROXY_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TOO_LARGE",
              message: "Файл слишком большой для предпросмотра (>20 МБ)",
            },
          },
          { status: 413 }
        );
      }

      const upstream = await fetch(resolved.downloadUrl);
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "TG_FETCH_FAILED", message: "Не удалось загрузить файл" },
          },
          { status: 502 }
        );
      }

      const contentType =
        upstream.headers.get("content-type") || guessContentType(resolved.filePath);
      const contentLength = upstream.headers.get("content-length");

      // Re-use the upstream stream — no buffering — so large media stays
      // memory-friendly.
      const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600, immutable",
      });
      if (contentLength) headers.set("Content-Length", contentLength);

      return new Response(upstream.body, { status: 200, headers });
    },
    { roles: ["admin"] }
  );
}
