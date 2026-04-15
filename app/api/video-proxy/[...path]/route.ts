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
  if (!token) return null;

  // Если токен содержит лишние параметры (например из-за двойного ?), отрезаем их
  const cleanToken = token.split('?')[0];

  try {
    const payload = jwt.verify(cleanToken, JWT_SECRET) as TokenPayload;
    return payload;
  } catch (error) {
    console.error("Token validation error. Token:", cleanToken, "Original:", token, "Error:", error);
    return null;
  }
}

function rewriteManifestUrls(manifest: string, videoId: string, token: string): string {
  let replacementsCount = 0;
  
  // 1. Заменяем абсолютные ссылки Cloudflare на наш прокси
  // Мы заменяем всю доменную часть до ID видео на наш прокси
  const result = manifest.replace(
    /https?:\/\/(?:videodelivery\.net|customer-[a-z0-9]+\.cloudflarestream\.com)\/([a-z0-9-]+)\/(.+?)(?=["'\s]|$)/g,
    (match, vid, rest) => {
        replacementsCount++;
        return `/api/video-proxy/${vid}/${rest}${rest.includes('?') ? '&' : '?'}token=${token}`;
    }
  );

  // 2. Для относительных путей (сегменты, вложенные манифесты) просто добавляем токен.
  // Мы не трогаем сам путь, позволяя браузеру разрешить его относительно текущего URL манифеста.
  // Ищем строки, которые выглядят как пути к файлам и не начинаются с http или /
  const finalResult = result.replace(
    /^(?!https?:\/\/|\/)(.*(?:\.ts|\.m3u8|\.m4s|\.mp4|\.vtt)(?:\?[^\s]*)?)$/gm,
    (match, path) => {
        replacementsCount++;
        return `${path}${path.includes('?') ? '&' : '?'}token=${token}`;
    }
  );

  // 3. Обрабатываем URI в тегах (например, для ключей шифрования)
  const finalWithUri = finalResult.replace(
    /URI=["']([^"']+\.[a-z0-9]+)(?:\?[^"']*)?["']/gi,
    (match, path) => {
        if (!path.startsWith('http') && !path.startsWith('/')) {
            replacementsCount++;
            return `URI="${path}${path.includes('?') ? '&' : '?'}token=${token}"`;
        }
        return match;
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
    // Путь уже содержит videoId как первый сегмент (проверено выше)
    const cloudflareUrl = new URL(`https://customer-${CUSTOMER_CODE}.cloudflarestream.com/${resourcePath}`);
    
    // Передаем все параметры запроса кроме токена безопасности
    searchParams.forEach((value, key) => {
      if (key !== 'token' && key !== 'apiKey' && !cloudflareUrl.searchParams.has(key)) {
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
