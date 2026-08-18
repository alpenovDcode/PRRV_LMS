"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, BookOpen, Play, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LearningPrompt = {
  kind: "certification" | "new_module" | "continue";
  title: string;
  message: string;
  actionLabel: string;
  link: string;
  courseTitle: string;
};

const styles = {
  certification: {
    icon: Award,
    wrapper: "border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50",
    iconWrapper: "bg-orange-100 text-orange-600",
    button: "bg-orange-500 hover:bg-orange-600",
  },
  new_module: {
    icon: BookOpen,
    wrapper: "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50",
    iconWrapper: "bg-blue-100 text-blue-600",
    button: "bg-blue-600 hover:bg-blue-700",
  },
  continue: {
    icon: Play,
    wrapper: "border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50",
    iconWrapper: "bg-emerald-100 text-emerald-600",
    button: "bg-emerald-600 hover:bg-emerald-700",
  },
};

export function LearningActionBanner() {
  const queryClient = useQueryClient();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const { data: prompt } = useQuery<LearningPrompt | null>({
    queryKey: ["learning-engagement-prompt"],
    queryFn: async () => {
      const response = await apiClient.get("/engagement/prompt");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      return response.data.data ?? null;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const promptKey = prompt ? `${prompt.kind}:${prompt.link}` : null;

  useEffect(() => {
    if (!promptKey) return;
    const dismissedAt = Number(sessionStorage.getItem(`learning-banner:${promptKey}`));
    setDismissedKey(dismissedAt ? promptKey : null);
  }, [promptKey]);

  if (!prompt || promptKey === dismissedKey) return null;

  const style = styles[prompt.kind];
  const Icon = style.icon;

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-start gap-4 rounded-xl border p-4 shadow-sm",
          style.wrapper
        )}
      >
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            style.iconWrapper
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{prompt.title}</p>
          <p className="mt-1 text-sm text-gray-600">{prompt.message}</p>
          <p className="mt-1 text-xs text-gray-500">{prompt.courseTitle}</p>
        </div>
        <Button asChild size="sm" className={cn("shrink-0 text-white", style.button)}>
          <Link href={prompt.link}>{prompt.actionLabel}</Link>
        </Button>
        <button
          type="button"
          aria-label="Скрыть рекомендацию"
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-700"
          onClick={() => {
            sessionStorage.setItem(`learning-banner:${promptKey}`, String(Date.now()));
            setDismissedKey(promptKey);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
