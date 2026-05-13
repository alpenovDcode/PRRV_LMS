// Small helper around Telegram's getFile endpoint. Used by the lead-chat
// media proxy to resolve a file_id -> a downloadable Telegram CDN URL.
//
// Kept separate from lib/tg/api.ts on purpose: that file is the canonical
// surface used by the bot engine / sender and we don't want to bloat it
// with admin-only concerns.

import { decryptToken } from "./crypto";

const TELEGRAM_API = "https://api.telegram.org";

interface TgGetFileResult {
  file_id: string;
  file_unique_id: string;
  file_path?: string;
  file_size?: number;
}

interface TgApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface ResolvedTelegramFile {
  filePath: string;
  fileSize: number | null;
  /** Direct CDN URL — embeds the bot token. NEVER send to a browser. */
  downloadUrl: string;
}

/**
 * Resolve a Telegram file_id into the CDN URL where the bytes live.
 * The returned URL is short-lived (~1h on Telegram's side); callers
 * should stream the bytes server-side and not redirect the browser to it.
 */
export async function getTelegramFilePath(
  encryptedToken: string,
  fileId: string,
  timeoutMs = 10_000
): Promise<ResolvedTelegramFile | null> {
  const token = decryptToken(encryptedToken);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${TELEGRAM_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: ctrl.signal }
    );
    const json = (await res.json()) as TgApiResponse<TgGetFileResult>;
    if (!json.ok || !json.result?.file_path) return null;
    return {
      filePath: json.result.file_path,
      fileSize: typeof json.result.file_size === "number" ? json.result.file_size : null,
      downloadUrl: `${TELEGRAM_API}/file/bot${token}/${json.result.file_path}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap content-type guess from the file_path extension. */
export function guessContentType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "oga":
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
