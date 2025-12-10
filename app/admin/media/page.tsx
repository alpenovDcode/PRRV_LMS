"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileIcon, Trash2, Copy, Upload, Image as ImageIcon, FileText, Film } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface MediaFile {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery<MediaFile[]>({
    queryKey: ["admin", "media"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/media");
      return response.data.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "media"] });
      toast.success("Файл успешно загружен");
      setIsUploading(false);
    },
    onError: () => {
      toast.error("Ошибка при загрузке файла");
      setIsUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const params = new URLSearchParams({ name: fileName });
      await apiClient.delete(`/admin/media?${params.toString()}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "media"] });
      toast.success("Файл удален");
    },
    onError: () => {
      toast.error("Не удалось удалить файл");
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      uploadMutation.mutate(e.target.files[0]);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return <ImageIcon className="h-8 w-8 text-blue-500" />;
    if (["pdf", "doc", "docx"].includes(ext || "")) return <FileText className="h-8 w-8 text-orange-500" />;
    if (["mp4", "mov", "avi"].includes(ext || "")) return <Film className="h-8 w-8 text-purple-500" />;
    return <FileIcon className="h-8 w-8 text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Медиа-библиотека</h1>
          <p className="text-gray-600 mt-1">Управление файлами и изображениями</p>
        </div>
        <div>
          <Input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <Button asChild disabled={isUploading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? "Загрузка..." : "Загрузить файл"}
            </label>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">Нет загруженных файлов</p>
          <p className="text-sm text-gray-500 mt-1">Загрузите файлы, чтобы использовать их в курсах</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {files.map((file) => (
            <Card key={file.name} className="overflow-hidden group relative">
              <CardContent className="p-4 flex flex-col items-center justify-center h-32 bg-gray-50">
                {["jpg", "jpeg", "png", "gif", "webp"].includes(file.name.split(".").pop()?.toLowerCase() || "") ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="h-full w-full object-cover rounded-md"
                  />
                ) : (
                  getFileIcon(file.name)
                )}
              </CardContent>
              <CardFooter className="p-3 flex flex-col items-start gap-1 bg-white border-t border-gray-100">
                <p className="text-sm font-medium truncate w-full" title={file.name}>
                  {file.name}
                </p>
                <div className="flex items-center justify-between w-full text-xs text-gray-500">
                  <span>{formatSize(file.size)}</span>
                  <span>
                    {formatDistanceToNow(new Date(file.createdAt), { locale: ru, addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => copyToClipboard(file.url)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Ссылка
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => {
                      if (confirm("Вы уверены, что хотите удалить этот файл?")) {
                        deleteMutation.mutate(file.name);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
