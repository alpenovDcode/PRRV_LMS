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
    // We use a simple httpOnly cookie with userId
    const cookieStore = await cookies();
    cookieStore.set("landing_session_user", user.id, { 
       httpOnly: true, 
       path: "/", 
       maxAge: 60 * 60 * 24 * 30 // 30 days 
    });

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
