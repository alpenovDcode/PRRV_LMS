"use client";

import { AlertTriangle, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { StreamData } from "./stream-detail";

interface AtRiskAlertProps {
  streams: StreamData[] | undefined;
  isLoading: boolean;
  onNavigateToStream?: (streamId: string) => void;
}

export function AtRiskAlert({ streams, isLoading, onNavigateToStream }: AtRiskAlertProps) {
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!streams || streams.length === 0) return null;

  const atRisk = streams
    .filter((s) => s.memberCount > 0 && s.activePercent < 35)
    .sort((a, b) => a.activePercent - b.activePercent);

  if (atRisk.length === 0) return null;

  const critical = atRisk.filter((s) => s.activePercent < 20);

  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-800 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
            {atRisk.length}{" "}
            {atRisk.length === 1 ? "поток" : atRisk.length < 5 ? "потока" : "потоков"} с низкой активностью
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {atRisk.map((s) => {
              const isCritical = s.activePercent < 20;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onNavigateToStream?.(s.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-opacity ${
                    onNavigateToStream ? "cursor-pointer hover:opacity-75" : "cursor-default"
                  }`}
                >
                  <TrendingDown
                    className={`h-3.5 w-3.5 shrink-0 ${isCritical ? "text-red-500" : "text-yellow-600"}`}
                  />
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.courseTitle && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">({s.courseTitle})</span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-xs h-5 ${
                      isCritical
                        ? "border-red-300 text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400"
                        : "border-yellow-300 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400"
                    }`}
                  >
                    {s.activePercent}% активны
                  </Badge>
                  <span className="text-xs text-muted-foreground">{s.memberCount} уч.</span>
                </button>
              );
            })}
          </div>
          {critical.length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              ⚠ {critical.length} {critical.length === 1 ? "поток" : "потока"} критически неактивны — менее 20% студентов
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
