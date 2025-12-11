const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding admin user...');
  
  // Hash the password
  const password = "0a3682fdd1d9c397658409c41247edcf696c6b40a7890c89c60a33c4183a3e52";
  const hash = await bcrypt.hash(password, 12);
  
  // Create or update admin user
  const admin = await prisma.user.upsert({
    where: { email: "prrv_admin@proryv.ru" },
    update: {},
    create: {
      email: "prrv_admin@proryv.ru",
      passwordHash: hash,
      fullName: "Администратор",
      role: UserRole ? UserRole.admin : 'admin', // Fallback if enum not exported
      emailVerified: true,
    },
  });

  console.log("✅ Admin user created:", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
