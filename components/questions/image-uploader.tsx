"use client";

import { useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface QuestionAttachment {
  url: string;
  name: string;
  type: string;
  size?: number | null;
}

interface Props {
  attachments: QuestionAttachment[];
  onChange: (next: QuestionAttachment[]) => void;
  maxFiles?: number;
  compact?: boolean;
}

export function ImageUploader({ attachments, onChange, maxFiles = 5, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (attachments.length + files.length > maxFiles) {
      toast.error(`Можно прикрепить не более ${maxFiles} изображений`);
      return;
    }
    setUploading(true);
    const next: QuestionAttachment[] = [...attachments];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: можно загружать только изображения`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "images");
        const res = await apiClient.post("/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const data = res.data?.data;
        if (data?.url) {
          next.push({
            url: data.url,
            name: data.originalName || data.name || file.name,
            type: file.type,
            size: file.size,
          });
        }
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.response?.data?.error?.message || "ошибка загрузки"}`);
      }
    }
    setUploading(false);
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (idx: number) => {
    onChange(attachments.filter((_, i) => i !== idx));
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="relative group">
              <img
                src={a.url}
                alt={a.name}
                className="h-20 w-20 object-cover rounded-md border"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                title="Удалить"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || attachments.length >= maxFiles}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {uploading ? "Загрузка..." : `Прикрепить изображение${attachments.length > 0 ? ` (${attachments.length}/${maxFiles})` : ""}`}
        </button>
      </div>
    </div>
  );
}
