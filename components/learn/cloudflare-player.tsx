"use client";

import { useEffect, useRef, useState } from "react";
import { Stream } from "@cloudflare/stream-react";

interface CloudflarePlayerProps {
  videoId: string;
  posterUrl?: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export function CloudflarePlayer({
  videoId,
  posterUrl,
  initialTime = 0,
  onTimeUpdate,
  onEnded,
  autoPlay = false,
}: CloudflarePlayerProps) {
  // We use a specific ref type that matches the Cloudflare Stream component instance
  // but to avoid strict type issues with the library, we can use any for the ref interaction
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Restore initial time when player is ready
  useEffect(() => {
    if (isReady && playerRef.current && initialTime > 0) {
      // The Cloudflare Stream React component exposes the DOM element or API
      // The 'currentTime' property on the stream element sets the time.
      // However, with the React component, we access the internal player element.
      // The library exposes a `streamRef` or we can use the ref directly.
      try {
        if (Math.abs(playerRef.current.currentTime - initialTime) > 2) {
             playerRef.current.currentTime = initialTime;
        }
      } catch (e) {
        console.error("Failed to set initial time:", e);
      }
    }
  }, [isReady, initialTime]);

  return (
    <div className="relative w-full aspect-video bg-black">
      <Stream
        streamRef={playerRef}
        src={videoId}
        poster={posterUrl}
        controls
        responsive={false} // We handle sizing with container
        className="w-full h-full absolute inset-0"
        autoplay={autoPlay}
        onPlay={() => {
           // Optional: Handle play event
        }}
        onTimeUpdate={(e: any) => {
          // The event detail contains the currentTime and duration
          const currentTime = e.detail?.currentTime || playerRef.current?.currentTime || 0;
          const duration = e.detail?.duration || playerRef.current?.duration || 0;
          
          if (onTimeUpdate) {
            onTimeUpdate(currentTime, duration);
          }
        }}
        onEnded={() => {
          if (onEnded) {
            onEnded();
          }
        }}
        // @ts-ignore - onReady exists in runtime but might be missing in types
        onReady={() => setIsReady(true)}
      />
    </div>
  );
}
