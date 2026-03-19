
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("--- Existing Landing Pages ---");
    const landings = await prisma.landingPage.findMany({
        select: { id: true, slug: true, title: true, isPublished: true }
    });
    console.table(landings);

    console.log("\n--- Existing Courses ---");
    const courses = await prisma.course.findMany({
        select: { id: true, slug: true, title: true }
    });
    console.table(courses);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
