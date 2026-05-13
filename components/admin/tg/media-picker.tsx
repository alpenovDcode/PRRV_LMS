"use client";

// Media picker dialog + small attachment-chip list. Used by the flow
// editor's message node to attach photos / videos / voice / video_notes
// from the bot's media library. Opens a modal that lists captured
// media with thumbnails (rendered via the existing /media/[fileId]
// proxy endpoint) and lets the admin select multiple items.
//
// Design choices:
//   - Library-only by default. URL is a secondary "advanced" option
//     so flow authors are nudged toward the cached file_id path.
//   - Multi-select is enabled — picking 2+ photos/videos automatically
//     becomes an album on send (sender enforces the album rules).
//   - Search filters across title and filename; kind chips filter
//     server-side so we don't ship the whole library to the browser.

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Image as ImageIcon, Search } from "lucide-react";
import type { MediaAttachment } from "@/lib/tg/flow-schema";

const KIND_META: Record<
  MediaAttachment["kind"],
  { label: string; icon: string }
> = {
  photo: { label: "Фото", icon: "📷" },
  video: { label: "Видео", icon: "🎬" },
  voice: { label: "Голосовое", icon: "🎤" },
  video_note: { label: "Кружок", icon: "⭕" },
  document: { label: "Документ", icon: "📎" },
  audio: { label: "Аудио", icon: "🎵" },
  animation: { label: "GIF", icon: "🎞" },
};

interface MediaLibraryItem {
  id: string;
  fileId: string;
  fileUniqueId: string | null;
  kind: MediaAttachment["kind"];
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  title: string | null;
  fileName: string | null;
  thumbFileId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiResponse {
  success: boolean;
  data: {
    items: MediaLibraryItem[];
    nextCursor: string | null;
    countsByKind: Record<string, number>;
  };
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
function fmtDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// One thumbnail tile. For photos/animations we lean on the media-proxy
// endpoint which streams the actual bytes. For voice / audio / docs we
// show an icon — Telegram doesn't surface a thumb for those anyway.
function MediaTile({
  item,
  botId,
  selected,
  onClick,
}: {
  item: MediaLibraryItem;
  botId: string;
  selected: boolean;
  onClick: () => void;
}) {
  const previewSource = item.thumbFileId ?? item.fileId;
  const showPreview =
    item.kind === "photo" ||
    item.kind === "animation" ||
    (item.kind === "video" && item.thumbFileId) ||
    (item.kind === "video_note" && item.thumbFileId);
  const previewUrl = showPreview
    ? `/api/admin/tg/bots/${botId}/media/${encodeURIComponent(previewSource)}`
    : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square rounded-md overflow-hidden border-2 text-left transition group ${
        selected
          ? "border-purple-500 ring-2 ring-purple-200"
          : "border-zinc-200 hover:border-purple-300"
      }`}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={item.title ?? ""}
          className="absolute inset-0 w-full h-full object-cover bg-zinc-100"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-50 text-3xl">
          {KIND_META[item.kind].icon}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-white">
        <div className="truncate font-medium" title={item.title ?? ""}>
          {item.title ?? item.fileName ?? KIND_META[item.kind].label}
        </div>
        <div className="flex items-center justify-between text-white/80">
          <span>{KIND_META[item.kind].label}</span>
          <span>{fmtDuration(item.duration) || fmtSize(item.fileSize)}</span>
        </div>
      </div>
      {selected && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
          ✓
        </div>
      )}
    </button>
  );
}

interface MediaPickerDialogProps {
  botId: string;
  open: boolean;
  onClose: () => void;
  // Existing attachments — used to seed the "selected" set so reopening
  // the picker shows what was already attached.
  existing: MediaAttachment[];
  // Called when the user confirms. Receives the full new attachments
  // list — completely replaces the old one.
  onConfirm: (next: MediaAttachment[]) => void;
}

export function MediaPickerDialog({
  botId,
  open,
  onClose,
  existing,
  onConfirm,
}: MediaPickerDialogProps) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<MediaAttachment["kind"] | "all">("all");
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Map from fileId -> existing attachment (for restoring selection).
  const existingByFileId = useMemo(() => {
    const m = new Map<string, MediaAttachment>();
    for (const a of existing) if (a.fileId) m.set(a.fileId, a);
    return m;
  }, [existing]);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setKind("all");
    setQ("");
    setSelectedIds(new Set());
    // We can't pre-select by id without first fetching the library,
    // so we'll mark "existing" items as selected during render below
    // by matching fileId.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `/api/admin/tg/bots/${botId}/media-library`,
          window.location.origin
        );
        if (kind !== "all") url.searchParams.set("kind", kind);
        if (q.trim()) url.searchParams.set("q", q.trim());
        url.searchParams.set("limit", "60");
        const res = await fetch(url);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!json.success) throw new Error("Не удалось загрузить библиотеку");
        setItems(json.data.items);
        setCounts(json.data.countsByKind);
        // First open: pre-select items matching existing attachments.
        setSelectedIds((prev) => {
          if (prev.size > 0) return prev;
          const next = new Set<string>();
          for (const it of json.data.items) {
            if (existingByFileId.has(it.fileId)) next.add(it.id);
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 250 : 0); // small debounce for the text query
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, kind, q, botId, existingByFileId]);

  const toggle = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const picked = items.filter((it) => selectedIds.has(it.id));
    const next: MediaAttachment[] = picked.map((p) => ({
      kind: p.kind,
      fileId: p.fileId,
      fileName: p.fileName ?? undefined,
      mimeType: p.mimeType ?? undefined,
      duration: p.duration ?? undefined,
    }));
    onConfirm(next);
    onClose();
  };

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Библиотека медиа</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          {/* Hint card explaining how to add media. */}
          <div className="text-[11px] text-zinc-600 bg-blue-50 border border-blue-200 rounded p-2">
            💡 Чтобы добавить медиа — отправь его в чат с ботом со своего
            аккаунта (если ты в списке админов в настройках бота). Файл
            автоматически появится здесь.
          </div>

          {/* Kind filter chips. */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setKind("all")}
              className={`text-xs px-2 py-1 rounded border ${
                kind === "all"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white border-zinc-200 hover:border-purple-300"
              }`}
            >
              Все {totalCount > 0 && <span className="opacity-60">{totalCount}</span>}
            </button>
            {(Object.keys(KIND_META) as MediaAttachment["kind"][]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                disabled={!counts[k]}
                className={`text-xs px-2 py-1 rounded border ${
                  kind === k
                    ? "bg-purple-600 text-white border-purple-600"
                    : counts[k]
                    ? "bg-white border-zinc-200 hover:border-purple-300"
                    : "bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed"
                }`}
              >
                {KIND_META[k].icon} {KIND_META[k].label}{" "}
                {counts[k] && <span className="opacity-60">{counts[k]}</span>}
              </button>
            ))}
          </div>

          {/* Search. */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по названию / имени файла"
              className="pl-7 text-sm"
            />
          </div>

          {/* Grid. */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {error && (
              <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded">
                {error}
              </div>
            )}
            {loading && items.length === 0 && (
              <div className="text-sm text-zinc-400 italic p-6 text-center">
                Загружаю…
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="text-sm text-zinc-400 italic p-6 text-center">
                Пусто. Отправь любое медиа боту — оно появится здесь.
              </div>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {items.map((it) => (
                <MediaTile
                  key={it.id}
                  item={it}
                  botId={botId}
                  selected={selectedIds.has(it.id)}
                  onClick={() => toggle(it.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between border-t pt-3">
          <div className="text-[11px] text-zinc-500">
            Выбрано: <strong>{selectedIds.size}</strong>
            {selectedIds.size > 1 && (
              <span className="ml-2">— отправится альбомом, если все фото/видео</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={confirm} disabled={selectedIds.size === 0}>
              Прикрепить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Compact in-editor list of currently-attached media. Each chip shows
// the kind icon, title, and a remove button. Clicking the "+ Добавить"
// chip opens the picker dialog.
interface MediaAttachmentsEditorProps {
  attachments: MediaAttachment[];
  legacyPhotoUrl?: string;
  onChange: (next: MediaAttachment[]) => void;
}

export function MediaAttachmentsEditor({
  attachments,
  legacyPhotoUrl,
  onChange,
}: MediaAttachmentsEditorProps) {
  // Pull botId out of the URL. We're always rendered under
  // /admin/bots/[botId]/... so this is safe.
  const params = useParams() as { botId?: string };
  const botId = params.botId ?? "";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  // Merge any legacy photoUrl into the visible list — but DON'T persist
  // the migration until the user touches anything (parent owns that).
  const visible = useMemo<MediaAttachment[]>(() => {
    if (attachments.length > 0) return attachments;
    if (legacyPhotoUrl) return [{ kind: "photo", url: legacyPhotoUrl }];
    return [];
  }, [attachments, legacyPhotoUrl]);

  const remove = (idx: number) => {
    onChange(visible.filter((_, i) => i !== idx));
  };
  const addUrl = () => {
    if (!urlDraft.trim()) return;
    onChange([
      ...visible,
      // Heuristic: anything ending in .mp4/.webm = video, .gif = animation,
      // .pdf/.zip/etc = document, otherwise photo. The user can re-pick the
      // kind later if needed (rare in practice).
      { kind: guessKindFromUrl(urlDraft), url: urlDraft.trim() },
    ]);
    setUrlDraft("");
    setUrlInputOpen(false);
  };

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Медиа</Label>
        <Badge variant="secondary" className="text-[10px]">
          {visible.length}/10
        </Badge>
      </div>
      {visible.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Без медиа. Можно прикрепить из библиотеки или вставить URL.
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((att, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 text-xs bg-zinc-50 rounded border border-zinc-200 px-2 py-1.5"
            >
              <span className="text-base shrink-0">{KIND_META[att.kind].icon}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">
                  {att.fileName ?? KIND_META[att.kind].label}
                </div>
                <div className="truncate text-[10px] text-zinc-500 font-mono">
                  {att.fileId
                    ? `file_id ${att.fileId.slice(0, 20)}…`
                    : att.url
                    ? att.url
                    : "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-zinc-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={!botId || visible.length >= 10}
          className="flex-1"
        >
          <ImageIcon className="h-3.5 w-3.5 mr-1" /> Из библиотеки
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setUrlInputOpen((v) => !v)}
          disabled={visible.length >= 10}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> URL
        </Button>
      </div>
      {urlInputOpen && (
        <div className="flex gap-1">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…/file.jpg"
            className="text-xs"
          />
          <Button size="sm" onClick={addUrl}>
            ОК
          </Button>
        </div>
      )}
      <MediaPickerDialog
        botId={botId}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existing={visible}
        // The picker REPLACES the entire attachment list with the
        // chosen items. That matches the multi-select UX (pick what
        // you want, deselect what you don't).
        onConfirm={(next) => onChange(next)}
      />
    </div>
  );
}

function guessKindFromUrl(url: string): MediaAttachment["kind"] {
  const lower = url.toLowerCase();
  if (/\.(mp4|webm|mov)(\?|$)/.test(lower)) return "video";
  if (/\.gif(\?|$)/.test(lower)) return "animation";
  if (/\.(mp3|ogg|m4a|aac|flac|wav)(\?|$)/.test(lower)) return "audio";
  if (/\.(pdf|zip|csv|xlsx|docx|pptx|txt|json)(\?|$)/.test(lower))
    return "document";
  return "photo";
}
