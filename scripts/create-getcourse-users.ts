/**
 * Создаёт LMS-аккаунты для пользователей GetCourse, которых ещё нет на платформе.
 * Для каждого нового пользователя также создаёт GetcourseData (67 полей).
 *
 * Запуск (локально):
 *   npx tsx scripts/create-getcourse-users.ts
 *
 * Запуск (продакшн):
 *   DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." \
 *     npx tsx scripts/create-getcourse-users.ts [/путь/к/файлу.csv]
 */

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (!process.env.DATABASE_URL) {
  try {
    const dotenv = require("dotenv");
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  } catch {
    // production — env vars уже установлены
  }
}

const db = new PrismaClient();

const CSV_PATH =
  process.argv[2] ||
  path.resolve(
    process.env.HOME!,
    "Downloads/user_export_2026-05-25_06-16-16.csv"
  );

const DEFAULT_PASSWORD = "password123";
const BATCH_SIZE = 200;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ";" && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h}_${count}`;
  });
}

async function main() {
  console.log(`\n📂 CSV:  ${CSV_PATH}`);
  console.log(`🔑 Пароль: ${DEFAULT_PASSWORD}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Файл не найден: ${CSV_PATH}`);
    process.exit(1);
  }

  // Хешируем пароль один раз для всех
  console.log("🔐 Хешируем пароль...");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  // Все существующие email в LMS
  const existing = await db.user.findMany({ select: { email: true } });
  const existingEmails = new Set(existing.map((u) => u.email.toLowerCase().trim()));
  console.log(`👥 Существующих пользователей в LMS: ${existingEmails.size}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let lineNum = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalNoEmail = 0;

  // Батч строк для обработки
  type CsvRow = Record<string, string>;
  let batch: CsvRow[] = [];

  const processBatch = async (rows: CsvRow[]) => {
    // 1. Создаём пользователей
    const usersToCreate = rows.map((row) => {
      const firstName = row["Имя"]?.trim() ?? "";
      const lastName = row["Фамилия"]?.trim() ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
      return {
        email: row["Email"].toLowerCase().trim(),
        passwordHash,
        fullName,
        phone: row["Телефон"]?.trim() || null,
        role: "student" as const,
        emailVerified: false,
      };
    });

    await db.user.createMany({ data: usersToCreate, skipDuplicates: true });

    // 2. Получаем ID только что созданных пользователей
    const emails = usersToCreate.map((u) => u.email);
    const createdUsers = await db.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const emailToId = new Map(createdUsers.map((u) => [u.email, u.id]));

    // 3. Создаём GetcourseData (только для новых, без существующих)
    const gcDataToCreate = rows
      .map((row) => {
        const email = row["Email"].toLowerCase().trim();
        const userId = emailToId.get(email);
        if (!userId) return null;
        return { userId, data: row };
      })
      .filter(Boolean) as { userId: string; data: CsvRow }[];

    if (gcDataToCreate.length > 0) {
      await db.getcourseData.createMany({
        data: gcDataToCreate,
        skipDuplicates: true,
      });
    }

    totalCreated += usersToCreate.length;
  };

  for await (const rawLine of rl) {
    lineNum++;
    const line = lineNum === 1 ? rawLine.replace(/^﻿/, "") : rawLine;

    if (lineNum === 1) {
      headers = deduplicateHeaders(parseCSVLine(line));
      console.log(`📋 Колонок: ${headers.length}`);
      continue;
    }

    if (!line.trim()) continue;

    const values = parseCSVLine(line);
    const row: CsvRow = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });

    const email = row["Email"]?.trim().toLowerCase();
    if (!email) { totalNoEmail++; continue; }
    if (existingEmails.has(email)) { totalSkipped++; continue; }

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      await processBatch(batch);
      batch = [];
      process.stdout.write(`\r✅ Создано: ${totalCreated} | Пропущено (уже есть): ${totalSkipped} | Без email: ${totalNoEmail}`);
    }
  }

  if (batch.length > 0) {
    await processBatch(batch);
  }

  console.log(`\n\n📊 Итог:`);
  console.log(`  ✅ Создано новых:          ${totalCreated}`);
  console.log(`  ⏭️  Уже были в LMS:         ${totalSkipped}`);
  console.log(`  ⚠️  Без email (пропущено):  ${totalNoEmail}`);
  console.log("\n🎉 Готово!\n");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ Ошибка:", e.message);
  await db.$disconnect();
  process.exit(1);
});
