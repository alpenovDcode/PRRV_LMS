
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slug = 'intensiv-day-1';
  const landing = await prisma.landingPage.findUnique({
    where: { slug },
  });
  console.log('Landing Page:', landing);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
