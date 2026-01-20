import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const CUSTOMER_CODE = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE!;

interface TokenPayload {
  videoId: string;
  userId: string;
  lessonId: string;
  exp: number;
}

function validateToken(token: string | null): TokenPayload | null {
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return payload;
  } catch (error) {
    console.error("Token validation error:", error);
    return null;
  }
}

function rewriteManifestUrls(manifest: string, videoId: string, token: string): string {
  // Заменяем все URL Cloudflare на наши прокси URL
  const cloudflarePattern = new RegExp(
    `https://customer-${CUSTOMER_CODE}\\.cloudflarestream\\.com/${videoId}/`,
    'g'
  );
  
  return manifest.replace(
    cloudflarePattern,
    `/api/video-proxy/${videoId}/`
  ).replace(
    /\.m3u8/g,
    `.m3u8?token=${token}`
  ).replace(
    /\.ts/g,
    `.ts?token=${token}`
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const { searchParams } = request.nextUrl;
    const token = searchParams.get("token");

    // Валидация токена
    const payload = validateToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Восстанавливаем путь к ресурсу
    const resourcePath = path.join("/");
    const videoId = payload.videoId;

    // Проверяем что videoId в пути совпадает с токеном
    if (!resourcePath.startsWith(videoId)) {
      return NextResponse.json(
        { error: "Video ID mismatch" },
        { status: 403 }
      );
    }

    // Формируем URL к Cloudflare
    const cloudflareUrl = `https://customer-${CUSTOMER_CODE}.cloudflarestream.com/${resourcePath}`;

    console.log(`[Video Proxy] Fetching: ${cloudflareUrl}`);

    // Запрашиваем ресурс у Cloudflare
    const response = await fetch(cloudflareUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      console.error(`[Video Proxy] Cloudflare error: ${response.status}`);
      return NextResponse.json(
        { error: "Video not found" },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("Content-Type") || "";

    // Если это манифест (.m3u8), переписываем URL
    if (contentType.includes("mpegurl") || resourcePath.endsWith(".m3u8")) {
      const manifestText = await response.text();
      const rewrittenManifest = rewriteManifestUrls(manifestText, videoId, token!);

      return new NextResponse(rewrittenManifest, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Для video segments (.ts), просто проксируем
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // 24 часа для сегментов
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[Video Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
