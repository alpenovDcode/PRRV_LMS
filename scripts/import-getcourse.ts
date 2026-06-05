/**
 * Импорт данных GetCourse для существующих пользователей LMS.
 *
 * Запуск (локальная БД):
 *   npx tsx scripts/import-getcourse.ts
 *
 * Запуск (продакшн БД):
 *   DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." \
 *     npx tsx scripts/import-getcourse.ts [/путь/к/файлу.csv]
 *
 * Если путь к файлу не указан — берёт ~/Downloads/user_export_2026-05-25_06-16-16.csv
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
}

const db = new PrismaClient();

const CSV_PATH =
  process.argv[2] ||
  path.resolve(
    process.env.HOME!,
    "Downloads/user_export_2026-05-25_06-16-16.csv"
  );

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Второй "utm_source" становится "utm_source_2", второй "Дата рождения" → "Дата рождения_2"
function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h}_${count}`;
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbDisplay = dbUrl.replace(/:\/\/[^@]+@/, "://<hidden>@");
  console.log(`\n📂 CSV:  ${CSV_PATH}`);
  console.log(`🔌 БД:   ${dbDisplay}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Файл не найден: ${CSV_PATH}`);
    process.exit(1);
  }

  // Все пользователи LMS
  const lmsUsers = await db.user.findMany({ select: { id: true, email: true } });
  const emailToId = new Map(lmsUsers.map((u) => [u.email.toLowerCase().trim(), u.id]));
  console.log(`👥 Пользователей в LMS: ${lmsUsers.length}`);

  // Читаем CSV (strip BOM если есть)
  const raw = fs.readFileSync(CSV_PATH, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw.split("\n");
  const headers = deduplicateHeaders(parseCSVLine(lines[0]));

  console.log(`📋 Колонок в CSV:       ${headers.length}`);
  console.log(`📄 Строк в CSV:         ${lines.length - 1}\n`);

  // Матчинг по email
  const toUpsert: { userId: string; data: Record<string, string> }[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });

    const csvEmail = row["Email"]?.toLowerCase().trim();
    if (!csvEmail) { skipped++; continue; }

    const userId = emailToId.get(csvEmail);
    if (!userId) { skipped++; continue; }

    toUpsert.push({ userId, data: row });
  }

  console.log(`✅ Совпало с LMS:  ${toUpsert.length}`);
  console.log(`⏭️  Не найдено:     ${skipped}\n`);

  if (toUpsert.length === 0) {
    console.log("⚠️  Совпадений нет. Проверь DATABASE_URL — возможно, нужна продакшн БД.\n");
    await db.$disconnect();
    return;
  }

  // Upsert батчами по 100
  const BATCH = 100;
  let done = 0;
  const now = new Date();

  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const batch = toUpsert.slice(i, i + BATCH);
    await Promise.all(
      batch.map(({ userId, data }) =>
        db.getcourseData.upsert({
          where: { userId },
          create: { userId, data, importedAt: now },
          update: { data, importedAt: now },
        })
      )
    );
    done += batch.length;
    process.stdout.write(`\r💾 Сохранено: ${done}/${toUpsert.length}`);
  }

  console.log("\n\n🎉 Готово!\n");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ Ошибка:", e.message);
  await db.$disconnect();
  process.exit(1);
});
