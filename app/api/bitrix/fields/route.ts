import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;

      if (!bitrixUrl) {
        return NextResponse.json(
          { error: "Bitrix webhook URL not configured" },
          { status: 500 }
        );
      }

      try {
        const res = await fetch(`${bitrixUrl}crm.deal.fields`);
        const data = await res.json();

        if (data.result) {
          const fields = Object.entries(data.result).map(
            ([key, value]: [string, any]) => ({
              id: key,
              label: value.formLabel || value.title || key,
              type: value.type,
              isRequired: value.isRequired,
              isReadOnly: value.isReadOnly,
            })
          );

          const writableFields = fields.filter((f: any) => !f.isReadOnly);
          return NextResponse.json(writableFields);
        }

        return NextResponse.json([]);
      } catch (error) {
        console.error("Error fetching Bitrix fields:", error);
        return NextResponse.json(
          { error: "Failed to fetch fields" },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
