import { NextResponse } from "next/server";

export async function GET() {
  const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
  
  if (!bitrixUrl) {
    return NextResponse.json({ error: "Bitrix webhook URL not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${bitrixUrl}crm.deal.fields`);
    const data = await res.json();
    
    if (data.result) {
      // Transform object to array and filter for useful fields
      const fields = Object.entries(data.result).map(([key, value]: [string, any]) => ({
        id: key,
        label: value.formLabel || value.title || key,
        type: value.type,
        isRequired: value.isRequired,
        isReadOnly: value.isReadOnly
      }));

      // Filter out system fields that shouldn't be mapped manually usually, 
      // or keep them if we want full flexibility. 
      // Let's keep custom fields (UF_*) and standard editable fields.
      const writableFields = fields.filter(f => 
        !f.isReadOnly && 
        (f.id.startsWith("UF_") || ["TITLE", "COMMENTS", "OPPORTUNITY", "BEGINDATE", "CLOSEDATE"].includes(f.id))
      );
      
      return NextResponse.json(writableFields);
    }
    
    return NextResponse.json([]);
  } catch (error) {
    console.error("Error fetching Bitrix fields:", error);
    return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 });
  }
}
