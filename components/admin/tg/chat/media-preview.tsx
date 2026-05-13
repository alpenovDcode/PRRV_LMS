"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileIcon } from "lucide-react";

interface RawPayload {
  document?: { file_name?: string; file_size?: number; mime_type?: string };
  audio?: { file_name?: string; duration?: number };
  voice?: { duration?: number };
  video?: { duration?: number; mime_type?: string };
}

interface Props {
  botId: string;
  mediaType: string;
  mediaFileId: string;
  caption?: string | null;
  rawPayload?: unknown;
  /** When true the bubble uses the dark "out" palette — affects fallbacks. */
  isOut?: boolean;
}

function getMediaUrl(botId: string, fileId: string): string {
  return `/api/admin/tg/bots/${botId}/media/${encodeURIComponent(fileId)}`;
}

export function MediaPreview({ botId, mediaType, mediaFileId, rawPayload, isOut }: Props) {
  const [errored, setErrored] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const url = getMediaUrl(botId, mediaFileId);
  const payload = (rawPayload && typeof rawPayload === "object" ? rawPayload : {}) as RawPayload;

  if (errored) {
    return (
      <div
        className={
          "rounded-lg border border-dashed px-3 py-4 text-xs " +
          (isOut ? "border-white/40 text-white/80" : "border-zinc-300 text-zinc-500")
        }
      >
        не удалось загрузить медиа
      </div>
    );
  }

  switch (mediaType) {
    case "photo":
      return (
        <>
          <img
            src={url}
            alt="фото"
            className="max-h-80 cursor-zoom-in rounded-lg object-cover"
            loading="lazy"
            onError={() => setErrored(true)}
            onClick={() => setLightboxOpen(true)}
          />
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
              <img
                src={url}
                alt="фото"
                className="max-h-[85vh] w-full rounded-lg object-contain"
              />
            </DialogContent>
          </Dialog>
        </>
      );
    case "voice":
      return (
        <audio
          controls
          src={url}
          className="w-full min-w-[220px] max-w-sm"
          onError={() => setErrored(true)}
        />
      );
    case "video":
      return (
        <video
          controls
          src={url}
          className="max-h-80 rounded-lg"
          onError={() => setErrored(true)}
        />
      );
    case "document": {
      const name = payload.document?.file_name ?? "файл";
      const size = payload.document?.file_size;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 " +
            (isOut
              ? "border-white/30 text-white hover:bg-white/10"
              : "border-zinc-300 text-zinc-800")
          }
        >
          <FileIcon className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-[220px]">{name}</span>
          {size ? (
            <span className={isOut ? "text-white/70 text-xs" : "text-xs text-muted-foreground"}>
              {formatBytes(size)}
            </span>
          ) : null}
        </a>
      );
    }
    default:
      return null;
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
