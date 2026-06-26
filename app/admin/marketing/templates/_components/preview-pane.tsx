"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Smartphone, X, Loader2 } from "lucide-react";

interface PreviewPaneProps {
  templateId: string;
  onClose: () => void;
}

/**
 * Pop-over панель с живым HTML preview письма.
 * Дёргает /preview API (компилирует + подставляет fake-переменные).
 * Тогглеры desktop/mobile меняют ширину iframe — точно как почтовый клиент.
 */
export function PreviewPane({ templateId, onClose }: PreviewPaneProps) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const { data, isFetching } = useQuery({
    queryKey: ["marketing-template-preview", templateId],
    queryFn: async () => {
      const r = await apiClient.post(`/admin/marketing/templates/${templateId}/preview`, {});
      return r.data.data as { html: string; subject: string; preheader: string | null };
    },
    // Pre-fetch on mount.
    refetchOnWindowFocus: false,
  });

  const iframeWidth = device === "desktop" ? "100%" : "375px";

  const srcDoc = useMemo(() => data?.html ?? "", [data]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <Card className="w-full max-w-5xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500">Тема</div>
            <div className="text-sm font-medium truncate">{data?.subject ?? "…"}</div>
            {data?.preheader && (
              <div className="text-xs text-gray-500 truncate">{data.preheader}</div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant={device === "desktop" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("desktop")}
              className="gap-2"
            >
              <Monitor className="h-4 w-4" />
              Desktop
            </Button>
            <Button
              variant={device === "mobile" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("mobile")}
              className="gap-2"
            >
              <Smartphone className="h-4 w-4" />
              Mobile
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
              <X className="h-4 w-4" />
              Закрыть
            </Button>
          </div>
        </div>
        <CardContent className="flex-1 overflow-auto bg-gray-100 p-6 flex items-start justify-center">
          {isFetching && !data ? (
            <div className="flex items-center gap-2 text-gray-500 mt-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              Компилируем превью…
            </div>
          ) : (
            <iframe
              srcDoc={srcDoc}
              style={{
                width: iframeWidth,
                maxWidth: device === "mobile" ? "375px" : "100%",
                height: "100%",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                background: "#fff",
              }}
              sandbox="allow-same-origin"
              title="Email preview"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
