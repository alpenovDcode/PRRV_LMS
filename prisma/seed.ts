import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultEmailTemplates } from "../lib/default-email-templates";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log("🌱 Seeding database...");



  // Seeding Email Templates
  console.log("📧 Seeding email templates...");
  for (const template of defaultEmailTemplates) {
    const existing = await prisma.emailTemplate.findFirst({
        where: { event: template.event },
    });

    if (!existing) {
        await prisma.emailTemplate.create({
            data: {
                event: template.event,
                name: template.name,
                subject: template.subject,
                body: template.body,
                variables: template.variables,
                isActive: true
            }
        });
    }
  }
  console.log("✅ Email templates seeded");

  // Seeding videos
  const videosPath = "cloudflare_videos.json";
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    // Resolve path relative to the project root (where package.json and seed.ts are running context usually)
    // Assuming seed command runs from project root
    const resolvedPath = path.resolve(process.cwd(), videosPath);
    
    const data = await fs.readFile(resolvedPath, "utf-8");
    const videos = JSON.parse(data);

    console.log(`📹 Found ${videos.length} videos in ${videosPath}. Seeding...`);

    let seededCount = 0;
    let skippedCount = 0;
    for (const video of videos) {
      const existingVideo = await prisma.videoLibrary.findUnique({
        where: { cloudflareId: video.id },
      });

      if (!existingVideo) {
        await prisma.videoLibrary.create({
          data: {
            title: video.title,
            cloudflareId: video.id,
            duration: Math.round(video.duration),
          },
        });
        seededCount++;
      } else {
        skippedCount++;
      }
    }
    console.log(`✅ Seeded ${seededCount} new videos. Skipped ${skippedCount} existing videos.`);

  } catch (error) {
    console.warn(`⚠️ Could not seed videos from ${videosPath}:`, error);
    // Determine if we should fail or just warn. Usually for seed it's better to know.
    // But if file is missing, maybe just warn.
  }

  console.log("🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });