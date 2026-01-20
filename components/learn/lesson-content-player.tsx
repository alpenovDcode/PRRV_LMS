
"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCloudflareImageUrl } from "@/lib/cloudflare-images";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuizPlayer } from "@/components/learn/quiz-player";
import { HLSVideoPlayer } from "@/components/learn/hls-video-player";
import { TrackDefinitionViewer } from "@/components/learn/track-definition-viewer";

interface LessonContentPlayerProps {
  lesson: {
    id: string;
    title: string;
    type: string;
    content: any;
    videoId?: string | null;
    videoDuration?: number | null;
    thumbnailUrl?: string | null;
    isFree?: boolean;
    isStopLesson?: boolean;
    dripRule?: any;
    settings?: any;
    progress?: {
      status: string;
      watchedTime: number;
    } | null;
  };
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  isPreview?: boolean; // If true, disable progress tracking and interactive features that require backend
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function LessonContentPlayer({ lesson, onTimeUpdate, onEnded, isPreview = false }: LessonContentPlayerProps) {
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [localWatchedTime, setLocalWatchedTime] = useState(0);

  // Extract videos array or create one from legacy fields
  const videos = lesson.content?.videos || (lesson.videoId ? [{ videoId: lesson.videoId, duration: lesson.videoDuration || 0, title: "Основное видео" }] : []);
  const activeVideo = videos[activeVideoIndex];

  // Reset active video when lesson changes
  useEffect(() => {
    setActiveVideoIndex(0);
    setLocalWatchedTime(lesson.progress?.watchedTime || 0);
  }, [lesson.id]);

  const handleTimeUpdate = (currentTime: number, duration: number) => {
    setLocalWatchedTime(Math.floor(currentTime));
    if (onTimeUpdate) {
      onTimeUpdate(currentTime, duration);
    }
  };

  const handleEnded = () => {
    if (onEnded) {
      onEnded();
    }
    // Auto-advance playlist
    if (activeVideoIndex < videos.length - 1) {
      setActiveVideoIndex(prev => prev + 1);
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
        {lesson.title || "Без названия"}
      </h1>

      {/* Video Player */}
      {lesson.type === "video" && (
        <div className="space-y-4 mb-6">
          {activeVideo && activeVideo.videoId ? (
            <>
              <Card className="border-gray-200 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative aspect-video bg-black">
                    <HLSVideoPlayer
                      videoId={activeVideo.videoId}
                      lessonId={lesson.id}
                      posterUrl={`https://${process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${activeVideo.videoId}/thumbnails/thumbnail.jpg`}
                      initialTime={isPreview ? 0 : (lesson.progress?.watchedTime || 0)}
                      onTimeUpdate={handleTimeUpdate}
                      onEnded={handleEnded}
                    />
                  </div>
                  {(activeVideo.duration > 0 || isPreview) && (
                    <div className="p-4 bg-gray-50 border-t border-gray-200">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">Прогресс просмотра</span>
                        <span className="font-semibold text-gray-900">
                          {formatTime(localWatchedTime)} / {formatTime(activeVideo.duration || 0)}
                        </span>
                      </div>
                      <Progress 
                        value={activeVideo.duration ? Math.round((localWatchedTime / activeVideo.duration) * 100) : 0} 
                        className="h-2" 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Playlist */}
              {videos.length > 1 && (
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Плейлист урока</h3>
                    <div className="space-y-2">
                      {videos.map((video: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => setActiveVideoIndex(idx)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                            idx === activeVideoIndex
                              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                              : "hover:bg-gray-50 text-gray-700"
                          )}
                        >
                          <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium",
                            idx === activeVideoIndex
                              ? "bg-blue-200 text-blue-700"
                              : "bg-gray-100 text-gray-500"
                          )}>
                            {idx === activeVideoIndex ? <Play className="h-3 w-3 fill-current" /> : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {video.title || `Видео ${idx + 1}`}
                            </p>
                            {video.duration > 0 && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {formatTime(video.duration)}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="p-8 text-center bg-gray-100 rounded-lg text-gray-500">
              Видео не выбрано
            </div>
          )}
        </div>
      )}

      {/* Text Type */}
      {lesson.type === "text" && (
        <Card className="mb-6 border-gray-200">
          <CardContent className="prose prose-sm max-w-none dark:prose-invert p-6">
            {lesson.content?.markdown ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ node, src, alt, ...props }) => {
                    if (src?.startsWith('cloudflare:')) {
                      const imageId = src.replace('cloudflare:', '');
                      const imageUrl = getCloudflareImageUrl(imageId);
                      return (
                        <img
                          src={imageUrl}
                          alt={alt || 'Изображение урока'}
                          className="rounded-lg my-4 max-w-full h-auto"
                          loading="lazy"
                          {...props}
                        />
                      );
                    }
                    return <img src={src} alt={alt} className="rounded-lg my-4 max-w-full h-auto" loading="lazy" {...props} />;
                  },
                }}
              >
                {lesson.content.markdown}
              </ReactMarkdown>
            ) : (
              <p className="text-gray-500">Контент урока пуст</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quiz Type */}
      {lesson.type === "quiz" && (
        <QuizPlayer lessonId={lesson.id} content={lesson.content} isPreview={isPreview} />
      )}

      {/* Track Definition Type */}
      {lesson.type === "track_definition" && (
        <TrackDefinitionViewer lessonId={lesson.id} isCompleted={lesson.progress?.status === "completed"} isPreview={isPreview} />
      )}

      {/* Unsupported Type */}
      {lesson.type !== "video" && lesson.type !== "text" && lesson.type !== "quiz" && lesson.type !== "track_definition" && (
        <Card className="mb-6 border-gray-200">
          <CardContent className="p-6">
            <p className="text-gray-500">Тип урока не поддерживается: {lesson.type}</p>
          </CardContent>
        </Card>
      )}

      {/* Links/Buttons */}
      {lesson.content?.links && Array.isArray(lesson.content.links) && lesson.content.links.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {lesson.content.links.map((link: any, idx: number) => (
            <Button
              key={idx}
              asChild
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
            >
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
