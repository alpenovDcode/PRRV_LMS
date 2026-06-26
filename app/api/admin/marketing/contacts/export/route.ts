import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { serializeCsv } from "@/lib/email/contacts/csv";
import { compileSegmentFilters } from "@/lib/email/segments/compile-filters";
import { buildSegmentFiltersFromQuery } from "../route";

/**
 * GET /api/admin/marketing/contacts/export
 *
 * CSV-экспорт контактов с теми же фильтрами что и /contacts list.
 * Использует тот же compileSegmentFilters, что и сегменты — гарантия
 * консистентности между «что я вижу в фильтре» и «что выгрузилось».
 *
 * Отдаёт `text/csv; charset=utf-8` с BOM (чтобы Excel понял кодировку),
 * имя файла включает дату для удобства Евгения.
 *
 * Лимит безопасности: 100 000 строк за раз; больше — повод задуматься и
 * выгружать пачками.
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const filters = buildSegmentFiltersFromQuery(searchParams);
      const where = compileSegmentFilters(filters);

      const MAX_EXPORT = 100_000;
      const users = await db.user.findMany({
        where,
        select: {
          email: true,
          fullName: true,
          role: true,
          tariff: true,
          track: true,
          emailValidated: true,
          marketingOptOut: true,
          unsubscribedAt: true,
          emailTags: true,
          createdAt: true,
          lastActiveAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_EXPORT,
      });

      const csv = serializeCsv(
        users.map((u) => ({
          email: u.email,
          fullName: u.fullName,
          role: u.role,
          tariff: u.tariff,
          track: u.track,
          emailValidated: u.emailValidated ? "yes" : "no",
          marketingOptOut: u.marketingOptOut ? "yes" : "no",
          unsubscribedAt: u.unsubscribedAt?.toISOString() ?? "",
          tags: Array.isArray(u.emailTags) ? (u.emailTags as string[]).join(";") : "",
          createdAt: u.createdAt.toISOString(),
          lastActiveAt: u.lastActiveAt?.toISOString() ?? "",
        })),
        [
          { key: "email", header: "Email" },
          { key: "fullName", header: "Полное имя" },
          { key: "role", header: "Роль" },
          { key: "tariff", header: "Тариф" },
          { key: "track", header: "Трек" },
          { key: "emailValidated", header: "Email валидирован" },
          { key: "marketingOptOut", header: "Отписан" },
          { key: "unsubscribedAt", header: "Дата отписки" },
          { key: "tags", header: "Теги" },
          { key: "createdAt", header: "Дата регистрации" },
          { key: "lastActiveAt", header: "Последняя активность" },
        ]
      );

      // BOM (U+FEFF) — чтобы Excel понимал UTF-8 без перекодировки.
      const body = "﻿" + csv;
      const filename = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
