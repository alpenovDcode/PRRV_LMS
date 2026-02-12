
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting homework content cleanup...');

  const submissions = await prisma.homeworkSubmission.findMany({
    where: {
      content: {
        not: null,
      },
    },
  });

  console.log(`Found ${submissions.length} submissions to check.`);

  let updatedCount = 0;

  for (const sub of submissions) {
    if (!sub.content) continue;

    let content = sub.content;
    let needsUpdate = false;
    
    // Try to unwrap double/triple serialization
    try {
       // First parse
       let parsed = JSON.parse(content);
       
       // If the result of the first parse is a STRING, then the original content was double-serialized.
       if (typeof parsed === 'string') {
          // It was double serialized.
          // Let's see if we can go deeper
          let CurrentLevel = parsed;
          let depth = 1;

          while (typeof CurrentLevel === 'string' && depth < 5) {
             try {
                const next = JSON.parse(CurrentLevel);
                if (typeof next === 'object' && next !== null) {
                   // We found the object!
                   content = CurrentLevel; 
                   needsUpdate = true;
                   break;
                }
                CurrentLevel = next;
                depth++;
             } catch (e) {
                break;
             }
          }
       }
       
       // Also check if _answers is double serialized inside the object
       let objectToScan = needsUpdate ? JSON.parse(content) : (typeof parsed === 'object' ? parsed : null);
       
       if (objectToScan && typeof objectToScan === 'object' && objectToScan !== null) {
          // Check _answers
          if (objectToScan._answers && typeof objectToScan._answers === 'string') {
             try {
                const answersParsed = JSON.parse(objectToScan._answers);
                if (typeof answersParsed === 'object' && answersParsed !== null) {
                   objectToScan._answers = answersParsed;
                   content = JSON.stringify(objectToScan);
                   needsUpdate = true;
                }
             } catch (e) {}
          }
       }

    } catch (e) {
       // Not JSON, ignore
    }

    if (needsUpdate) {
      console.log(`Fixing submission ${sub.id}...`);
      await prisma.homeworkSubmission.update({
        where: { id: sub.id },
        data: { content },
      });
      updatedCount++;
    }
  }

  console.log(`Cleanup complete. Updated ${updatedCount} submissions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
