
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const submissionId = "f52e4ff3-5943-4a7f-888a-7f0c7bd4c750";
  console.log(`Fetching submission ${submissionId}...`);
  
  try {
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      console.log("Submission not found!");
      return;
    }

    console.log("Submission found.");
    console.log("Content Type:", typeof submission.content);
    console.log("Content Value (JSON stringified):");
    console.log(JSON.stringify(submission.content, null, 2));
    
    // Check for weird characters
    if (typeof submission.content === 'string') {
        console.log("Detailed char codes of first 20 chars:");
        for(let i=0; i<Math.min(20, submission.content.length); i++) {
            console.log(`${i}: ${submission.content[i]} (${submission.content.charCodeAt(i)})`);
        }
    }

  } catch (e) {
    console.error("Error", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
