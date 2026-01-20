import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log("🌱 Seeding database...");

  // Создание админа
  const adminPassword = await hashPassword("Evgeni2323_admin");
  const admin = await prisma.user.upsert({
    where: { email: "prrv_admin@proryv.ru" },
    update: {},
    create: {
      email: "prrv_admin@proryv.ru",
      passwordHash: "adminPassword",
      fullName: "Администратор",
      role: UserRole.admin,
      emailVerified: true,
    },
  });

  console.log("✅ Admin user created:", admin.email);



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