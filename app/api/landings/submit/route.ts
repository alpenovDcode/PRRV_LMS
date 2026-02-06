import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";
import { hash } from "bcrypt";

export async function POST(req: Request) {
  try {
    const { blockId, data, answers } = await req.json();
    
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
          console.log("Starting Bitrix integration...");
          const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
          const funnelId = process.env.BITRIX_FUNNEL_ID || "14";
          const stageId = process.env.BITRIX_SOURCE_STAGE_ID || "C14:PREPAYMENT_INVOIC";
          
          if (!bitrixUrl) {
             console.error("Bitrix URL not found in env");
             return;
          }

          // 6.1. Get Landing Page Title and Prepare Q&A
          const landingBlock = await prisma.landingBlock.findUnique({
             where: { id: blockId }, // Use blockId from request
             include: { page: true }
          });
          
          // Fetch all blocks for this page to find questions
          const allBlocks = await prisma.landingBlock.findMany({
             where: { pageId: landingBlock?.pageId },
             orderBy: { orderIndex: 'asc' }
          });

          // Format Q&A
          let qaString = "";
          // Note: 'answers' is captured from the parent scope (destructured at top of POST)
          
          Object.entries(answers || {}).forEach(([blkId, answer]) => {
              const questionBlock = allBlocks.find(b => b.id === blkId);
              if (questionBlock && (questionBlock.content as any).html) {
                 const questionText = (questionBlock.content as any).html.replace(/<[^>]*>?/gm, ' ').trim();
                 qaString += `Вопрос: ${questionText}\nОтвет: ${answer}\n\n`;
              }
          });

          const landingTitle = landingBlock?.page.title || "Unknown Landing";
          console.log(`Processing Bitrix for landing: ${landingTitle}`);
          
          // 6.2. Find or Create Contact
          console.log(`Searching contact by email: ${email}`);
          const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${email}&select[]=ID`);
          const searchData = await searchRes.json();
          
          let contactId = searchData.result?.[0]?.ID;
          console.log(`Found contact ID: ${contactId}`);
          
          if (!contactId) {
             console.log("Contact not found, creating new...");
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
             console.log(`Created new contact ID: ${contactId}`);
          }
          
          if (contactId) {
             // 6.3. Create Deal
             const dealTitle = `Сдал ДЗ [${landingTitle}]`;
             const dealFields = {
                TITLE: dealTitle,
                CATEGORY_ID: funnelId,
                STAGE_ID: stageId,
                CONTACT_ID: contactId,
                OPENED: "Y",
                UF_CRM_1770370823754: qaString
             };
             console.log("Creating deal with fields:", JSON.stringify(dealFields));

             const dealRes = await fetch(`${bitrixUrl}crm.deal.add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fields: dealFields })
             });
             const dealData = await dealRes.json();
             console.log("Deal creation result:", dealData);
          } else {
             console.error("Failed to get Contact ID, skipping deal creation");
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
