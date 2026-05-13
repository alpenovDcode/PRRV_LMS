// Media auto-capture for the admin-controlled file_id library.
//
// When an admin (whitelisted in TgBot.adminChatIds) sends a media
// message to the bot, this module:
//   1. Extracts the largest-quality file_id from the update
//   2. Upserts a TgMediaFile row keyed on (botId, fileUniqueId)
//   3. Sends a short HTML ack back to the admin with the file_id
//
// This is the only practical way to send large videos (>50MB) via
// Bot API — once Telegram has the bytes, we can reuse the same
// file_id from any bot endpoint for free.

import { db } from "../db";
import { tgSendMessage } from "./api";
import { trackEvent } from "./events";

// Minimal local copies of the Telegram update objects we care about.
// Keeping these here (instead of importing from inbound.ts) avoids a
// cycle and lets us unit-test extractMedia() in isolation.
interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
interface VideoOrAnim {
  file_id: string;
  file_unique_id: string;
  width?: number;
  height?: number;
  duration?: number;
  mime_type?: string;
  file_size?: number;
  thumbnail?: PhotoSize;
  file_name?: string;
}
interface Voice {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
}
interface VideoNote {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  file_size?: number;
  thumbnail?: PhotoSize;
}
interface Document {
  file_id: string;
  file_unique_id: string;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  thumbnail?: PhotoSize;
}
interface Audio {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  title?: string;
  performer?: string;
}
export interface TgMessageWithMedia {
  message_id: number;
  caption?: string;
  photo?: PhotoSize[];
  video?: VideoOrAnim;
  voice?: Voice;
  video_note?: VideoNote;
  document?: Document;
  audio?: Audio;
  animation?: VideoOrAnim;
}

export type MediaKind =
  | "photo"
  | "video"
  | "voice"
  | "video_note"
  | "document"
  | "audio"
  | "animation";

export interface CapturedMedia {
  kind: MediaKind;
  fileId: string;
  fileUniqueId: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  fileName?: string;
  thumbFileId?: string;
}

// Pulls media out of a Telegram message. Returns null if the message
// has no media. For photos we always take the LARGEST size — the
// resulting file_id refers to the highest-quality variant and Telegram
// auto-downscales on the receiving end.
export function extractMedia(msg: TgMessageWithMedia): CapturedMedia | null {
  if (msg.photo && msg.photo.length > 0) {
    const biggest = msg.photo[msg.photo.length - 1];
    return {
      kind: "photo",
      fileId: biggest.file_id,
      fileUniqueId: biggest.file_unique_id,
      fileSize: biggest.file_size,
      width: biggest.width,
      height: biggest.height,
    };
  }
  if (msg.video) {
    return {
      kind: "video",
      fileId: msg.video.file_id,
      fileUniqueId: msg.video.file_unique_id,
      mimeType: msg.video.mime_type,
      fileSize: msg.video.file_size,
      width: msg.video.width,
      height: msg.video.height,
      duration: msg.video.duration,
      fileName: msg.video.file_name,
      thumbFileId: msg.video.thumbnail?.file_id,
    };
  }
  if (msg.video_note) {
    return {
      kind: "video_note",
      fileId: msg.video_note.file_id,
      fileUniqueId: msg.video_note.file_unique_id,
      fileSize: msg.video_note.file_size,
      duration: msg.video_note.duration,
      thumbFileId: msg.video_note.thumbnail?.file_id,
    };
  }
  if (msg.voice) {
    return {
      kind: "voice",
      fileId: msg.voice.file_id,
      fileUniqueId: msg.voice.file_unique_id,
      mimeType: msg.voice.mime_type,
      fileSize: msg.voice.file_size,
      duration: msg.voice.duration,
    };
  }
  if (msg.audio) {
    return {
      kind: "audio",
      fileId: msg.audio.file_id,
      fileUniqueId: msg.audio.file_unique_id,
      mimeType: msg.audio.mime_type,
      fileSize: msg.audio.file_size,
      duration: msg.audio.duration,
      fileName: msg.audio.file_name ?? msg.audio.title,
    };
  }
  if (msg.animation) {
    return {
      kind: "animation",
      fileId: msg.animation.file_id,
      fileUniqueId: msg.animation.file_unique_id,
      mimeType: msg.animation.mime_type,
      fileSize: msg.animation.file_size,
      width: msg.animation.width,
      height: msg.animation.height,
      duration: msg.animation.duration,
      fileName: msg.animation.file_name,
      thumbFileId: msg.animation.thumbnail?.file_id,
    };
  }
  if (msg.document) {
    return {
      kind: "document",
      fileId: msg.document.file_id,
      fileUniqueId: msg.document.file_unique_id,
      mimeType: msg.document.mime_type,
      fileSize: msg.document.file_size,
      fileName: msg.document.file_name,
      thumbFileId: msg.document.thumbnail?.file_id,
    };
  }
  return null;
}

const KIND_LABELS: Record<MediaKind, string> = {
  photo: "📷 Фото",
  video: "🎬 Видео",
  voice: "🎤 Голосовое",
  video_note: "⭕ Кружок",
  document: "📎 Документ",
  audio: "🎵 Аудио",
  animation: "🎞 GIF",
};

function defaultTitle(captured: CapturedMedia, capturedAt: Date): string {
  if (captured.fileName) return captured.fileName;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${capturedAt.getFullYear()}-${pad(capturedAt.getMonth() + 1)}-${pad(
    capturedAt.getDate(),
  )} ${pad(capturedAt.getHours())}:${pad(capturedAt.getMinutes())}`;
  return `${KIND_LABELS[captured.kind].replace(/^\S+\s/, "")} ${stamp}`;
}

// Save the captured media and (optionally) reply to the admin with the
// file_id. Idempotent on (botId, fileUniqueId): re-sending the same
// file refreshes file_id + lastUsedAt instead of creating duplicates.
export async function captureAdminMedia(args: {
  botId: string;
  encryptedToken: string;
  adminChatId: string;
  message: TgMessageWithMedia;
  ackInChat: boolean;
}): Promise<{ captured: boolean; mediaId?: string }> {
  const media = extractMedia(args.message);
  if (!media) return { captured: false };

  const existing = await db.tgMediaFile.findFirst({
    where: { botId: args.botId, fileUniqueId: media.fileUniqueId },
  });
  const now = new Date();

  let mediaRow;
  if (existing) {
    mediaRow = await db.tgMediaFile.update({
      where: { id: existing.id },
      data: {
        fileId: media.fileId,
        capturedByChatId: args.adminChatId,
        lastUsedAt: now,
      },
    });
  } else {
    mediaRow = await db.tgMediaFile.create({
      data: {
        botId: args.botId,
        fileId: media.fileId,
        fileUniqueId: media.fileUniqueId,
        kind: media.kind,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        width: media.width,
        height: media.height,
        duration: media.duration,
        fileName: media.fileName,
        thumbFileId: media.thumbFileId,
        title: defaultTitle(media, now),
        source: "inbound",
        capturedByChatId: args.adminChatId,
      },
    });
  }

  trackEvent({
    type: "media.captured",
    botId: args.botId,
    properties: { kind: media.kind, mediaId: mediaRow.id, isNew: !existing },
  }).catch(() => {});

  if (args.ackInChat) {
    const sizeKb = media.fileSize ? Math.round(media.fileSize / 1024) : null;
    const ack = [
      `<b>${KIND_LABELS[media.kind]}</b> сохранён в библиотеку.`,
      `Заголовок: <code>${defaultTitle(media, now)}</code>`,
      sizeKb != null ? `Размер: ${sizeKb} КБ` : "",
      existing ? "<i>уже был — обновили file_id</i>" : "",
    ]
      .filter(Boolean)
      .join("\n");
    await tgSendMessage(args.encryptedToken, args.adminChatId, ack, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }).catch(() => undefined);
  }

  return { captured: true, mediaId: mediaRow.id };
}
