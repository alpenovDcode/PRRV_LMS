"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, FileText, Music } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import type { BriefFileType } from "@/lib/brief";

export interface BriefFileItem {
  id: string;
  fileType: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  caseId: string | null;
}

interface FileUploaderProps {
  fileType: BriefFileType;
  caseId?: string;
  files: BriefFileItem[];
  accept?: string;
  multiple?: boolean;
  hint?: string;
  onChange: () => void;
}

export function FileUploader({
  fileType,
  caseId,
  files,
  accept = "image/*",
  multiple = true,
  hint,
  onChange,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(selected)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("fileType", fileType);
        if (caseId) fd.append("caseId", caseId);
        await apiClient.post("/brief/files", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      onChange();
      toast.success(selected.length > 1 ? "Файлы загружены" : "Файл загружен");
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (fileId: string) => {
    try {
      await apiClient.delete(`/brief/files/${fileId}`);
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Не удалось удалить");
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((f) => (
            <div
              key={f.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {f.mimeType?.startsWith("image/") ? (
                <Image
                  src={f.fileUrl}
                  alt={f.fileName || ""}
                  fill
                  className="object-cover"
                  sizes="200px"
                  unoptimized
                />
              ) : (
                <a
                  href={f.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-xs"
                >
                  {f.mimeType?.startsWith("audio/") ? (
                    <Music className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="line-clamp-2 break-all">
                    {f.fileName || "Файл"}
                  </span>
                </a>
              )}
              <button
                type="button"
                onClick={() => remove(f.id)}
                aria-label="Удалить файл"
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {files.length > 0 ? "Загрузить ещё" : "Загрузить файл"}
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
