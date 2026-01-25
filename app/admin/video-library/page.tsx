"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Film, Trash, Copy, Clock, Search, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import axios from "axios";

interface VideoFile {
  id: string;
  title: string;
  cloudflareId: string;
  duration: number;
  createdAt: string;
}

export default function VideoLibraryPage() {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: videos = [], isLoading } = useQuery<VideoFile[]>({
    queryKey: ["admin", "video-library", searchTerm],
    queryFn: async () => {
      const response = await apiClient.get("/admin/video-library", {
        params: { query: searchTerm }
      });
      return response.data.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // 1. Get Upload URL
      const { data: { data: { uploadURL, videoId } } } = await apiClient.post("/admin/video-library/upload-url", {
        name: file.name
      });

      // 2. Upload to Cloudflare
      const formData = new FormData();
      formData.append("file", file);
      
      await axios.post(uploadURL, formData, {
        headers: {
          "Content-Type": "multipart/form-data" 
        },
        onUploadProgress: (progressEvent) => {
           if (progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentCompleted);
           }
        }
      });

      // 3. Save metadata to our DB
      await apiClient.post("/admin/video-library", {
        title: file.name,
        cloudflareId: videoId,
        duration: 0 // Duration will be available after processing, 0 for now
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "video-library"] });
      toast.success("Видео успешно загружено и обрабатывается");
      setIsUploading(false);
      setUploadProgress(0);
    },
    onError: (error: any) => {
      console.error(error);
      toast.error("Ошибка при загрузке видео");
      setIsUploading(false);
      setUploadProgress(0);
    },
  });

  // Since DELETE endpoint is not implemented in video-library route (GET/POST only), 
  // we will strictly stick to GET/POST for now or add DELETE support if needed.
  // The user prompt only asked for ADDING videos. Clean up can be separate task.

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      setUploadProgress(0);
      uploadMutation.mutate(e.target.files[0]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("ID скопирован");
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "Обработка...";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Видео-библиотека</h1>
          <p className="text-gray-600 mt-1">Управление видеоконтентом (Cloudflare Stream)</p>
        </div>
        <div>
           {isUploading ? (
               <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border shadow-sm">
                   <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                       <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                   </div>
                   <span className="text-sm font-medium text-gray-600">{uploadProgress}%</span>
               </div>
           ) : (
             <>
                <Input
                    type="file"
                    id="video-upload"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                />
                <Button asChild disabled={isUploading}>
                    <label htmlFor="video-upload" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Загрузить видео
                    </label>
                </Button>
             </>
           )}
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border">
        <Search className="h-5 w-5 text-gray-400 ml-2" />
        <Input
          placeholder="Поиск по названию..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Film className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">Нет видео</p>
          <p className="text-sm text-gray-500 mt-1">Загрузите первое видео, чтобы использовать его в уроках</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map((video) => (
            <Card key={video.id} className="overflow-hidden group hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
                 <Film className="h-12 w-12 text-gray-700" />
                 <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                     {formatDuration(video.duration)}
                 </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-900 truncate mb-1" title={video.title}>{video.title}</h3>
                <div className="flex items-center text-xs text-gray-500 gap-2 mb-4">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(video.createdAt), { locale: ru, addSuffix: true })}
                </div>
                
                <div className="flex items-center gap-2">
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="w-full text-xs h-8"
                     onClick={() => copyToClipboard(video.cloudflareId)}
                   >
                     <Copy className="h-3 w-3 mr-2" />
                     ID
                   </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
