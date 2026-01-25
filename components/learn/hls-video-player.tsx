"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface HLSVideoPlayerProps {
  videoId: string;
  lessonId?: string;
  posterUrl?: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export function HLSVideoPlayer({
  videoId,
  lessonId,
  posterUrl,
  initialTime = 0,
  onTimeUpdate,
  onEnded,
  autoPlay = false,
}: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Определяем устройство для выбора качества
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

  // Генерация токена
  useEffect(() => {
    setToken(null); // Сбрасываем старый токен при смене видео
    setError(null); // Сбрасываем ошибки
    setIsLoading(true); // Показываем лоадер

    async function generateToken() {
      try {
        const response = await apiClient.post("/video/token", {
          videoId,
          lessonId,
        });

        setToken(response.data.data.token);
      } catch (err: any) {
        console.error("Token generation error:", err);
        setError("Не удалось получить доступ к видео");
        setIsLoading(false);
      }
    }

    generateToken();
  }, [videoId, lessonId]);

  // Инициализация плеера
  useEffect(() => {
    if (!token || !videoRef.current) return;

    const video = videoRef.current;
    const manifestUrl = `/api/video-proxy/${videoId}/manifest/video.m3u8?token=${token}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        // Оптимизация буфера
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        // Предпочитать высокое качество
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
      });

      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        console.log("Video manifest loaded");
        setIsLoading(false);
        setIsReady(true);

        // Настройка качества: 720p для мобильных, 1080p для десктопа
        const targetHeight = isMobile ? 720 : 1080;
        const targetLevel = hls.levels.findIndex(
          (level) => level.height === targetHeight
        );

        if (targetLevel !== -1) {
          hls.currentLevel = targetLevel;
          console.log(`Set quality to ${targetHeight}p`);
        } else {
          // Fallback: минимум 720p
          const fallbackLevel = hls.levels.findIndex(
            (level) => level.height >= 720
          );
          if (fallbackLevel !== -1) {
            hls.currentLevel = fallbackLevel;
            console.log(`Fallback quality: ${hls.levels[fallbackLevel].height}p`);
          }
        }

        if (autoPlay) {
          video.play().catch(console.error);
        }
      });

      hls.on(Hls.Events.ERROR, function (event, data) {
        console.error("HLS error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Ошибка загрузки видео. Проверьте интернет-соединение.");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Ошибка воспроизведения видео.");
              hls.recoverMediaError();
              break;
            default:
              setError("Произошла критическая ошибка воспроизведения.");
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS support
      video.src = manifestUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        setIsReady(true);
        if (autoPlay) {
          video.play().catch(console.error);
        }
      });
    } else {
      setError("Ваш браузер не поддерживает воспроизведение видео");
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [token, videoId, autoPlay, isMobile]);

  // Restore initial time
  useEffect(() => {
    if (isReady && videoRef.current && initialTime > 0) {
      try {
        if (Math.abs(videoRef.current.currentTime - initialTime) > 2) {
          videoRef.current.currentTime = initialTime;
        }
      } catch (e) {
        console.error("Failed to set initial time:", e);
      }
    }
  }, [isReady, initialTime]);

  // Time update handler
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const handleTimeUpdate = () => {
      if (onTimeUpdate) {
        onTimeUpdate(video.currentTime, video.duration);
      }
    };

    const handleEnded = () => {
      if (onEnded) {
        onEnded();
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [onTimeUpdate, onEnded]);

  if (error) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-lg flex items-center justify-center">
        <div className="text-center text-white p-6">
          <p className="text-lg mb-2">⚠️ {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Перезагрузить страницу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="w-12 h-12 text-white animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        poster={posterUrl}
        playsInline
      />
    </div>
  );
}
