
import { NextResponse } from "next/server";

export async function GET() {
  const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
  
  if (!bitrixUrl) {
    return NextResponse.json({ error: "Bitrix webhook URL not configured" }, { status: 500 });
  }

  try {
    // 1. Fetch Funnels (Categories)
    const funnelsRes = await fetch(`${bitrixUrl}crm.dealcategory.list`);
    const funnelsData = await funnelsRes.json();
    const funnels = funnelsData.result || [];

    // Add Default "General" Funnel (ID 0)
    // Bitrix doesn't return ID 0 in dealcategory.list
    const allFunnels = [
      { ID: "0", NAME: "Общая воронка (Default)" },
      ...funnels
    ];

    // 2. Fetch Stages for each Funnel
    const results = await Promise.all(allFunnels.map(async (funnel: any) => {
      let stages = [];
      try {
        if (funnel.ID === "0") {
          // Default funnel stages are in crm.status.list with ENTITY_ID = DEAL_STAGE
          const stagesRes = await fetch(`${bitrixUrl}crm.status.list?filter[ENTITY_ID]=DEAL_STAGE`);
          const stagesData = await stagesRes.json();
          stages = stagesData.result || [];
        } else {
          // Custom funnel stages are in crm.dealcategory.stage.list with id = funnel.ID
          const stagesRes = await fetch(`${bitrixUrl}crm.dealcategory.stage.list?id=${funnel.ID}`);
          const stagesData = await stagesRes.json();
          stages = stagesData.result || [];
        }
      } catch (e) {
        console.error(`Failed to fetch stages for funnel ${funnel.ID}`, e);
      }

      // Sort stages by SORT field
      stages.sort((a: any, b: any) => parseInt(a.SORT) - parseInt(b.SORT));

      return {
        id: funnel.ID,
        name: funnel.NAME,
        stages: stages.map((s: any) => ({
          id: s.STATUS_ID || s.ID, // STATUS_ID is usually the string identifier
          name: s.NAME,
          sort: s.SORT
        }))
      };
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching Bitrix data:", error);
    return NextResponse.json({ error: "Failed to fetch data from Bitrix" }, { status: 500 });
  }
}
