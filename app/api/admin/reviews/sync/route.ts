import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { syncReviews, SyncSource } from "@/lib/reviews/sync";

// Скрапинг через Crawlbase (особенно Яндекс с JS-рендером) занимает ~30-90 сек.
// nginx-таймаут для этого роута поднят до 300с в nginx/conf.d/default.conf.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json().catch(() => ({}));
        const url = new URL(request.url);
        // Можно указать ?source=otzovik|yandex_maps чтобы синкать по одному
        // источнику за раз и не упираться в таймаут.
        const sourceParam = url.searchParams.get("source") as SyncSource | null;
        const sources: SyncSource[] = sourceParam
          ? [sourceParam]
          : body.sources ?? ["otzovik", "yandex_maps"];

        const data = await syncReviews(sources);
        return NextResponse.json<ApiResponse>({ success: true, data });
      } catch (error) {
        console.error("Reviews sync error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Ошибка синхронизации" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
