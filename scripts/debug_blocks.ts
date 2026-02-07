
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const blockId = "1a4f0c74-a4a4-4975-ad10-3f6a7fbe69f8"; // From screenshot
  
  console.log(`Checking block ${blockId}...`);
  
  const block = await prisma.landingBlock.findUnique({
    where: { id: blockId },
    include: { 
       page: true,
       lesson: { include: { module: true } }
    }
  });

  if (!block) {
    console.log("Block not found!");
    return;
  }

  console.log("Block found:");
  console.log("- Type:", block.type);
  console.log("- Page ID:", block.pageId);
  console.log("- Page Title:", block.page.title);
  console.log("- Lesson ID:", block.lessonId);
  
  if (block.lesson) {
     console.log("- Lesson Title:", block.lesson.title);
     console.log("- Lesson AI Prompt:", block.lesson.aiPrompt ? "YES" : "NO");
     console.log("- Course ID:", block.lesson.module ? block.lesson.module.courseId : "Module missing");
  } else {
     console.log("- No lesson linked.");
  }

  console.log("Checking User alpewagaming@gmail.com...");
  const user = await prisma.user.findUnique({
     where: { email: "alpewagaming@gmail.com" }
  });
  console.log(user ? "- User exists" : "- User not found");

  if (user) {
     console.log("Checking Audit Logs for user...");
     const logs = await prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5
     });
     logs.forEach(log => {
        console.log(`[${log.action}] ${log.createdAt.toISOString()}:`, JSON.stringify(log.details));
     });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
