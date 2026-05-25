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
        // 1. Fetch Funnels (Categories)
        const funnelsRes = await fetch(`${bitrixUrl}crm.dealcategory.list`);
        const funnelsData = await funnelsRes.json();
        const funnels = funnelsData.result || [];

        // Add Default "General" Funnel (ID 0)
        const allFunnels = [
          { ID: "0", NAME: "Общая воронка (Default)" },
          ...funnels,
        ];

        // 2. Fetch Stages for each Funnel
        const results = await Promise.all(
          allFunnels.map(async (funnel: any) => {
            let stages: any[] = [];
            try {
              if (funnel.ID === "0") {
                const stagesRes = await fetch(
                  `${bitrixUrl}crm.status.list?filter[ENTITY_ID]=DEAL_STAGE`
                );
                const stagesData = await stagesRes.json();
                stages = stagesData.result || [];
              } else {
                const stagesRes = await fetch(
                  `${bitrixUrl}crm.dealcategory.stage.list?id=${funnel.ID}`
                );
                const stagesData = await stagesRes.json();
                stages = stagesData.result || [];
              }
            } catch (e) {
              console.error(`Failed to fetch stages for funnel ${funnel.ID}`, e);
            }

            stages.sort(
              (a: any, b: any) => parseInt(a.SORT) - parseInt(b.SORT)
            );

            return {
              id: funnel.ID,
              name: funnel.NAME,
              stages: stages.map((s: any) => ({
                id: s.STATUS_ID || s.ID,
                name: s.NAME,
                sort: s.SORT,
              })),
            };
          })
        );

        return NextResponse.json(results);
      } catch (error) {
        console.error("Error fetching Bitrix data:", error);
        return NextResponse.json(
          { error: "Failed to fetch data from Bitrix" },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
