import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";
import { hash } from "bcrypt";

export async function POST(req: Request) {
  try {
    const { blockId, data } = await req.json();
    
    // Mapping: keys from LandingForm are labels ("Email", "Имя", "Телефон")
    // Use flexible lookup
    const emailKey = Object.keys(data).find(k => k.toLowerCase() === "email");
    const nameKey = Object.keys(data).find(k => k.toLowerCase() === "имя" || k.toLowerCase() === "name");

    const email = (emailKey ? data[emailKey] : data.email)?.toLowerCase().trim();
    const fullName = nameKey ? data[nameKey] : data.name;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // 1. Find or Create User
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const password = uuidv4(); // Random password
      const passwordHash = await hash(password, 10);
      
      user = await prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: "student",
          tariff: "SR" // Default tariff?
        }
      });
    }

    // 2. Schedule Auto-Review
    // Delay: 60 - 90 minutes
    const delayMinutes = Math.floor(Math.random() * (90 - 60 + 1) + 60);
    const autoResponseScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // 3. Pick random response template
    const block = await prisma.landingBlock.findUnique({ where: { id: blockId } });
    const templates = block?.responseTemplates || [];
    const validTemplates = templates.filter(t => t && t.trim() !== "");
    
    let responseTemplateIndex = null;
    if (validTemplates.length > 0) {
       // Find random index among NON-empty templates
       // But we store index relative to the full array to be safe? 
       // We'll store the index of the full array.
       // First, identify indices of valid templates
       const validIndices = templates
          .map((t, i) => (t && t.trim() !== "") ? i : -1)
          .filter(i => i !== -1);
       
       if (validIndices.length > 0) {
          const rand = Math.floor(Math.random() * validIndices.length);
          responseTemplateIndex = validIndices[rand];
       }
    }

    // 4. Create Submission
    const submission = await prisma.homeworkSubmission.create({
      data: {
        userId: user.id,
        landingBlockId: blockId,
        content: JSON.stringify(data), // Store full form data
        status: "pending",
        autoResponseScheduledAt,
        responseTemplateIndex
      }
    });

    // 5. Set Cookie for Session Persistence
    const cookieStore = await cookies();
    cookieStore.set("landing_session_user", user.id, { 
       httpOnly: true, 
       path: "/", 
       maxAge: 60 * 60 * 24 * 30 // 30 days 
    });

    // 6. Integrate with Bitrix24 (Async, don't block response)
    (async () => {
       try {
          const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
          const funnelId = process.env.BITRIX_FUNNEL_ID || "14";
          const stageId = process.env.BITRIX_SOURCE_STAGE_ID || "C14:PREPAYMENT_INVOIC";
          
          if (!bitrixUrl) return;

          // 6.1. Get Landing Page Title
          // We must cast or ensure relation exists. prisma findUnique returns typed object.
          // If relation not included in types, we might need simple fix.
          // Actually, `landingBlock` type is inferred. If `include: { page: true }` works, it should have page.
          // The error says: Property 'page' does not exist... maybe Prisma client needs regeneration or I made a typo.
          // `landingBlock.page` should exist if `include` is correct.
          // However, for safety and quick fix in route handling:
          const landingBlockWithPage = await prisma.landingBlock.findUnique({
             where: { id: blockId }, // Use blockId from request, submission.landingBlockId is same
             include: { page: true }
          });
          
          const landingTitle = landingBlockWithPage?.page?.title || "Unknown Landing";
          
          // 6.2. Find or Create Contact
          // Search by email
          const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${email}&select[]=ID`);
          const searchData = await searchRes.json();
          
          let contactId = searchData.result?.[0]?.ID;
          
          if (!contactId) {
             // Create new contact
             const phoneKey = Object.keys(data).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("телефон"));
             const phone = phoneKey ? data[phoneKey] : null;

             const createContactRes = await fetch(`${bitrixUrl}crm.contact.add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                   fields: {
                      NAME: fullName || "Студент",
                      EMAIL: [{ VALUE: email, VALUE_TYPE: "WORK" }],
                      PHONE: phone ? [{ VALUE: phone, VALUE_TYPE: "WORK" }] : [],
                      SOURCE_ID: "WEB"
                   }
                })
             });
             const createData = await createContactRes.json();
             contactId = createData.result;
          }
          
          if (contactId) {
             // 6.3. Create Deal
             const dealTitle = `Сдал ДЗ [${landingTitle}]`;
             await fetch(`${bitrixUrl}crm.deal.add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                   fields: {
                      TITLE: dealTitle,
                      CATEGORY_ID: funnelId,
                      STAGE_ID: stageId,
                      CONTACT_ID: contactId,
                      OPENED: "Y"
                   }
                })
             });
          }

       } catch (err) {
          console.error("Bitrix integration error:", err);
       }
    })();

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
