
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const submissions = await prisma.homeworkSubmission.findMany({
    where: { content: { not: null } },
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  console.log("--- START DUMP ---");
  for (const sub of submissions) {
     console.log(`ID: ${sub.id}`);
     console.log(`RAW CONTENT:`);
     console.log(sub.content);
     console.log("---");
     
     try {
        JSON.parse(sub.content);
        console.log("PARSE: OK");
     } catch (e) {
        console.log("PARSE: FAIL - " + e.message);
     }
     console.log("================");
  }
  console.log("--- END DUMP ---");
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
