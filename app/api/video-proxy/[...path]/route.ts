import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const ENV_CUSTOMER_CODE = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE!;
// Remove "customer-" prefix if present to avoid duplication in URL construction
const CUSTOMER_CODE = ENV_CUSTOMER_CODE.replace(/^customer-/, '');

interface TokenPayload {
  videoId: string;
  userId: string;
  lessonId: string;
  exp: number;
}

function validateToken(token: string | null): TokenPayload | null {
  if (!token) {
    console.warn("[Video Proxy] No token provided in request");
    return null;
  }
 
  // Очищаем токен от возможных параметров, если они прилипли
  const cleanToken = token.split(/[?&]/)[0];

  try {
    const payload = jwt.verify(cleanToken, JWT_SECRET) as TokenPayload;
    return payload;
  } catch (error: any) {
    console.error("[Video Proxy] Token validation failed:", {
      message: error.message,
      expiredAt: error.expiredAt,
      tokenPrefix: cleanToken.substring(0, 10) + "..."
    });
    return null;
  }
}

function rewriteManifestUrls(manifest: string, videoId: string, token: string): string {
  let replacementsCount = 0;
  
  const encodedToken = encodeURIComponent(token);
  
  // 1. Заменяем абсолютные ссылки Cloudflare на наш прокси
  const result = manifest.replace(
    /https?:\/\/(?:videodelivery\.net|customer-[a-z0-9]+\.cloudflarestream\.com)\/([a-z0-9-]+)\/([^\s?"']+)(?:\?[^\s"']*)?/g,
    (match, vid, rest) => {
        replacementsCount++;
        const connector = rest.includes('?') ? '&' : '?';
        return `/api/video-proxy/${vid}/${rest}${connector}ptoken=${encodedToken}`;
    }
  );

  // 2. Для относительных путей просто добавляем токен.
  // Любая непустая строка, не начинающаяся с '#' и не с '/' или 'http', — это URI ресурса
  // (стандарт HLS). Не ограничиваемся расширениями, т.к. CF Stream может возвращать
  // варианты/аудио-треки без привычных расширений.
  const finalResult = result.replace(
    /^(?!#)(?!\s*$)(?!https?:\/\/)(?!\/)([^\r\n]+)$/gm,
    (match, path) => {
        replacementsCount++;
        const connector = path.includes('?') ? '&' : '?';
        return `${path}${connector}ptoken=${encodedToken}`;
    }
  );

  // 3. Обрабатываем URI в тегах (#EXT-X-MEDIA, #EXT-X-MAP, #EXT-X-KEY и т.п.)
  const finalWithUri = finalResult.replace(
    /URI="([^"]+)"/g,
    (match, path) => {
        // Абсолютные Cloudflare-URL уже переписаны шагом 1; пропускаем только
        // те, что уже указывают на наш прокси или на внешний http(s).
        if (path.startsWith('http')) return match;
        if (path.includes('ptoken=')) return match;
        replacementsCount++;
        const connector = path.includes('?') ? '&' : '?';
        return `URI="${path}${connector}ptoken=${encodedToken}"`;
    }
  );

  console.log(`[Video Proxy] Manifest rewritten: ${replacementsCount} replacements made`);
  return finalWithUri;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const { searchParams } = request.nextUrl;
    // Используем ptoken для избежания конфликтов с нативными токенами Cloudflare
    const token = searchParams.get("ptoken") || searchParams.get("token");

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
    // Путь уже содержит videoId как первый сегмент (проверено выше)
    const cloudflareUrl = new URL(`https://customer-${CUSTOMER_CODE}.cloudflarestream.com/${resourcePath}`);
    
    // Передаем все оригинальные параметры запроса (кроме нашего ptoken)
    // Это важно для сохранения Cloudflare-подписей (параметр token)
    searchParams.forEach((value, key) => {
      if (key !== 'ptoken' && key !== 'apiKey' && !cloudflareUrl.searchParams.has(key)) {
        cloudflareUrl.searchParams.append(key, value);
      }
    });

    console.log(`[Video Proxy] Request for: ${path.join('/')}`);
    console.log(`[Video Proxy] Forwarding to: ${cloudflareUrl.toString()}`);

    // Получаем Range из входящего запроса
    const range = request.headers.get("range");

    // Запрашиваем ресурс у Cloudflare
    const proxyHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };
    
    if (range) {
      proxyHeaders["Range"] = range;
    }

    const response = await fetch(cloudflareUrl.toString(), { 
      headers: proxyHeaders 
    });

    console.log(`[Video Proxy] Cloudflare response status: ${response.status}`);

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

    // Для video segments (.ts, .m4s и т.д.), проксируем с поддержкой Range
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    
    // Передаем важные заголовки от Cloudflare для поддержки перемотки и кэширования
    const headersToForward = [
      "Cache-Control",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ];

    headersToForward.forEach(h => {
      const val = response.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    // Если Cache-Control не пришел, ставим свой (24 часа для сегментов)
    if (!responseHeaders.has("Cache-Control")) {
      responseHeaders.set("Cache-Control", "public, max-age=86400");
    }

    return new NextResponse(response.body, {
      status: response.status, // Может быть 200 или 206
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Video Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
