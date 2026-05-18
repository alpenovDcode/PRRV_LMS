"use client";

import { useRef, useState, useEffect } from "react";
import { Play, Pause, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  mine: boolean;
}

export function AudioMessage({ url, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s) || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[260px]">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />

      <Mic className={cn("h-4 w-4 shrink-0", mine ? "text-blue-200" : "text-gray-400")} />

      <button
        type="button"
        onClick={toggle}
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
          mine
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className={cn(
            "h-1.5 rounded-full cursor-pointer",
            mine ? "bg-white/30" : "bg-gray-200"
          )}
          onClick={seek}
        >
          <div
            className={cn("h-full rounded-full transition-[width]", mine ? "bg-white" : "bg-blue-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={cn("text-xs tabular-nums", mine ? "text-blue-100" : "text-gray-400")}>
          {fmt(currentTime)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}
