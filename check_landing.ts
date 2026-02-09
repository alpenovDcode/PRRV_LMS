
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slug = 'intensiv-day-1';
  console.log(`Checking ${slug}...`);
  
  const before = await prisma.landingPage.findUnique({ where: { slug } });
  console.log('Views before:', before?.views);

  const updated = await prisma.landingPage.update({
    where: { slug },
    data: { views: { increment: 1 } },
  });
  console.log('Views after increment:', updated.views);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
