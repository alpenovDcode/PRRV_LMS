/**
 * Импорт заказов GetCourse в таблицу getcourse_orders.
 * Импортируются только заказы с заполненным Email.
 *
 * Запуск (локально):
 *   npx tsx scripts/import-getcourse-orders.ts
 *
 * Запуск (продакшн):
 *   DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." \
 *     npx tsx scripts/import-getcourse-orders.ts [/путь/к/файлу.csv]
 */

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

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
    "Downloads/deal_export_2026-05-25_07-09-34.csv"
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

function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h}_${count}`;
  });
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function parseDecimal(val: string): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(",", ".").replace(/\s/g, ""));
  return isNaN(n) ? null : n;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log(`\n📂 CSV:  ${CSV_PATH}`);
  console.log(`🔌 БД:   ${dbUrl.replace(/:\/\/[^@]+@/, "://<hidden>@")}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Файл не найден: ${CSV_PATH}`);
    process.exit(1);
  }

  // Все LMS-пользователи для матчинга
  const lmsUsers = await db.user.findMany({ select: { id: true, email: true } });
  const emailToId = new Map(lmsUsers.map((u) => [u.email.toLowerCase().trim(), u.id]));
  console.log(`👥 Пользователей в LMS: ${lmsUsers.length}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let batch: object[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let lineNum = 0;
  const BATCH_SIZE = 200;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    await db.getcourseOrder.createMany({ data: batch as any, skipDuplicates: true });
    totalImported += batch.length;
    batch = [];
    process.stdout.write(`\r💾 Импортировано: ${totalImported} | Пропущено: ${totalSkipped}`);
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
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });

    const email = row["Email"]?.trim();
    if (!email) { totalSkipped++; continue; }

    const gcOrderId = row["ID заказа"]?.trim();
    if (!gcOrderId) { totalSkipped++; continue; }

    const userId = emailToId.get(email.toLowerCase()) ?? null;

    batch.push({
      gcOrderId,
      gcNumber: row["Номер"] || null,
      gcUserId: row["ID пользователя"] || null,
      customerName: row["Пользователь"] || null,
      email,
      phone: row["Телефон"] || null,
      composition: row["Состав заказа"] || null,
      status: row["Статус"] || null,
      amount: parseDecimal(row["Стоимость, RUB"]),
      amountPaid: parseDecimal(row["Оплачено"]),
      currency: row["Валюта"] || "RUB",
      paymentMethod: row["Платежная система"] || null,
      gcCreatedAt: parseDate(row["Дата создания"]),
      gcPaidAt: parseDate(row["Дата оплаты"]),
      userId,
      data: row,
    });

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  console.log(`\n\n✅ Совпало с LMS:  ${[...batch].filter((b: any) => b.userId).length}`);
  console.log(`📦 Всего импортировано: ${totalImported}`);
  console.log(`⏭️  Пропущено (без email): ${totalSkipped}`);
  console.log("\n🎉 Готово!\n");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ Ошибка:", e.message);
  await db.$disconnect();
  process.exit(1);
});
