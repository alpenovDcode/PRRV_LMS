import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log("🌱 Seeding database...");

  // Создание админа
  const adminPassword = await hashPassword("0a3682fdd1d9c397658409c41247edcf696c6b40a7890c89c60a33c4183a3e52");
  const admin = await prisma.user.upsert({
    where: { email: "prrv_admin@proryv.ru" },
    update: {},
    create: {
      email: "prrv_admin@proryv.ru",
      passwordHash: adminPassword,
      fullName: "Администратор",
      role: UserRole.admin,
      emailVerified: true,
    },
  });

  console.log("✅ Admin user created:", admin.email);

  // Создание тестового студента
  const studentPassword = await hashPassword("student123");
  const student = await prisma.user.upsert({
    where: { email: "student@test.ru" },
    update: {},
    create: {
      email: "student@test.ru",
      passwordHash: studentPassword,
      fullName: "Тестовый Студент",
      role: UserRole.student,
      emailVerified: true,
    },
  });

  console.log("✅ Student user created:", student.email);

  // Создание тестового куратора
  const curatorPassword = await hashPassword("curator123");
  const curator = await prisma.user.upsert({
    where: { email: "curator@test.ru" },
    update: {},
    create: {
      email: "curator@test.ru",
      passwordHash: curatorPassword,
      fullName: "Тестовый Куратор",
      role: UserRole.curator,
      emailVerified: true,
    },
  });

  console.log("✅ Curator user created:", curator.email);

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