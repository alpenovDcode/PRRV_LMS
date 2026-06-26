import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import {
  compileSegmentFilters,
  type SegmentFilters,
} from "@/lib/email/segments/compile-filters";

/**
 * GET /api/admin/marketing/contacts
 *
 * Список контактов с фильтрами и пагинацией. Использует тот же compile-filters
 * что и сегменты — это гарантирует что превью сегмента и список контактов
 * под идентичными условиями покажут одинаковое количество.
 *
 * Query params строятся из тех же ключей что в SegmentFilters:
 *   search, roles (csv), tariffs (csv), tracks (csv), tags (csv),
 *   subscription, validated, lastActiveDays, inactiveDays,
 *   createdAfter, createdBefore, enrolledInCourseIds (csv),
 *   notEnrolledInCourseIds (csv), groupIds (csv).
 *
 * + Пагинация: page (1+), limit (1..200).
 */

function parseCsv(value: string | null): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildSegmentFiltersFromQuery(params: URLSearchParams): SegmentFilters {
  const search = params.get("search")?.trim() || undefined;
  const roles = parseCsv(params.get("roles"));
  const tariffs = parseCsv(params.get("tariffs"));
  const tracks = parseCsv(params.get("tracks"));
  const tags = parseCsv(params.get("tags"));
  const groupIds = parseCsv(params.get("groupIds"));
  const enrolledInCourseIds = parseCsv(params.get("enrolledInCourseIds"));
  const notEnrolledInCourseIds = parseCsv(params.get("notEnrolledInCourseIds"));
  const subscription = (params.get("subscription") || undefined) as
    | "all"
    | "subscribed"
    | "unsubscribed"
    | undefined;
  const validatedRaw = params.get("validated");
  const emailValidated =
    validatedRaw === "true" ? true : validatedRaw === "false" ? false : undefined;
  const lastActiveDaysRaw = params.get("lastActiveDays");
  const inactiveDaysRaw = params.get("inactiveDays");
  const createdAfter = params.get("createdAfter") || undefined;
  const createdBefore = params.get("createdBefore") || undefined;

  return {
    search,
    roles: roles.length > 0 ? (roles as SegmentFilters["roles"]) : undefined,
    tariffs: tariffs.length > 0 ? (tariffs as SegmentFilters["tariffs"]) : undefined,
    tracks: tracks.length > 0 ? tracks : undefined,
    tags: tags.length > 0 ? tags : undefined,
    groupIds: groupIds.length > 0 ? groupIds : undefined,
    enrolledInCourseIds: enrolledInCourseIds.length > 0 ? enrolledInCourseIds : undefined,
    notEnrolledInCourseIds: notEnrolledInCourseIds.length > 0 ? notEnrolledInCourseIds : undefined,
    subscription,
    emailValidated,
    lastActiveDays: lastActiveDaysRaw ? Number(lastActiveDaysRaw) : undefined,
    inactiveDays: inactiveDaysRaw ? Number(inactiveDaysRaw) : undefined,
    createdAfter,
    createdBefore,
  };
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const filters = buildSegmentFiltersFromQuery(searchParams);
      const where = compileSegmentFilters(filters);

      const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        db.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            tariff: true,
            track: true,
            createdAt: true,
            lastActiveAt: true,
            emailValidated: true,
            marketingOptOut: true,
            unsubscribedAt: true,
            externalContactId: true,
            contactSyncedAt: true,
            emailTags: true,
            isBlocked: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
        }),
        db.user.count({ where }),
      ]);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { items, total, page, limit },
      });
    },
    { roles: [UserRole.admin] }
  );
}
