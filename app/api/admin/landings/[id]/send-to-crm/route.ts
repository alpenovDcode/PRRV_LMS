import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-tracking";

const prisma = new PrismaClient();

async function bitrixBatch(
  bitrixUrl: string,
  commands: Record<string, { method: string; params: Record<string, any> }>
): Promise<Record<string, any>> {
  const body: Record<string, string> = {};
  for (const [key, cmd] of Object.entries(commands)) {
    const params = new URLSearchParams();
    const flattenParams = (obj: Record<string, any>, prefix = "") => {
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}[${k}]` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          flattenParams(v, fullKey);
        } else if (Array.isArray(v)) {
          v.forEach((item, i) => {
            if (typeof item === "object") {
              flattenParams(item, `${fullKey}[${i}]`);
            } else {
              params.append(`${fullKey}[${i}]`, String(item));
            }
          });
        } else if (v !== undefined && v !== null) {
          params.append(fullKey, String(v));
        }
      }
    };
    flattenParams(cmd.params);
    body[`cmd[${key}]`] = `${cmd.method}?${params.toString()}`;
  }

  const formBody = Object.entries(body)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(`${bitrixUrl}batch`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
  });
  const data = await res.json();
  return data.result?.result ?? {};
}

function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}

function buildQaString(content: Record<string, any>): string {
  const { _answers, ...fields } = content;
  let qa = "";
  for (const [label, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) {
      const str = typeof value === "object" ? JSON.stringify(value) : String(value);
      if (str.trim()) qa += `${label}: ${str}\n`;
    }
  }
  if (_answers) {
    const list = Array.isArray(_answers) ? _answers : Object.values(_answers);
    list.forEach((ans: any, i: number) => {
      qa += `Ответ ${i + 1}: ${ans}\n`;
    });
  }
  return qa.trim();
}

function findEmail(content: Record<string, any>): string {
  // English keys
  if (typeof content.email === "string" && content.email) return content.email;
  // Scan by known Russian label variants (case-insensitive)
  const emailKeys = ["почта", "email", "e-mail", "эл. почта", "электронная почта"];
  for (const [key, value] of Object.entries(content)) {
    if (emailKeys.includes(key.toLowerCase()) && typeof value === "string" && value) return value;
  }
  // Fallback: any value that looks like an email
  for (const value of Object.values(content)) {
    if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  }
  return "";
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { id } = params;
    const { funnelId, fieldId } = await req.json();

    if (!funnelId || !fieldId) {
      return NextResponse.json({ error: "funnelId и fieldId обязательны" }, { status: 400 });
    }

    const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
    if (!bitrixUrl) {
      return NextResponse.json({ error: "Bitrix24 webhook URL не настроен" }, { status: 500 });
    }

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { landingBlock: { pageId: id } },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (submissions.length === 0) {
      return NextResponse.json({ sent: 0, total: 0, errors: [] });
    }

    const categoryId = String(funnelId) === "0" ? 0 : Number(funnelId);

    // --- STEP 1: Parse all submissions ---
    const parsed = submissions.map((sub) => {
      let content: Record<string, any> = {};
      try { content = sub.content ? JSON.parse(sub.content) : {}; } catch { content = {}; }
      const email = sub.user?.email || findEmail(content);
      const qa = buildQaString(content);
      return { subId: sub.id, email, qa };
    });

    const errors: { id: string; error: string }[] = [];
    let sent = 0;

    // --- STEP 2: Batch-search contacts by email (25 per batch) ---
    const contactIdMap: Record<string, string> = {};

    const emailChunks = chunk(parsed.filter((p) => p.email), 40);
    for (const ch of emailChunks) {
      const cmds: Record<string, { method: string; params: Record<string, any> }> = {};
      ch.forEach((p, i) => {
        cmds[`c${i}`] = {
          method: "crm.contact.list",
          params: { filter: { EMAIL: p.email }, select: ["ID", "EMAIL"] },
        };
      });
      const results = await bitrixBatch(bitrixUrl, cmds);
      ch.forEach((p, i) => {
        const found = results[`c${i}`]?.[0];
        if (found?.ID) contactIdMap[p.email] = found.ID;
      });
    }

    // --- STEP 3: Batch-search existing deals by contactId + funnelId (25 per batch) ---
    const dealIdMap: Record<string, string> = {}; // email -> dealId (latest)

    const withContact = parsed.filter((p) => p.email && contactIdMap[p.email]);
    const noContact = parsed.filter((p) => !p.email || !contactIdMap[p.email]);
    noContact.forEach((p) =>
      errors.push({ id: p.subId, error: p.email ? "Контакт не найден в Bitrix" : "Email не указан" })
    );

    const dealSearchChunks = chunk(withContact, 40);
    for (const ch of dealSearchChunks) {
      const cmds: Record<string, { method: string; params: Record<string, any> }> = {};
      ch.forEach((p, i) => {
        cmds[`d${i}`] = {
          method: "crm.deal.list",
          params: {
            filter: { CATEGORY_ID: categoryId, CONTACT_ID: contactIdMap[p.email] },
            select: ["ID"],
            order: { ID: "DESC" },
          },
        };
      });
      const results = await bitrixBatch(bitrixUrl, cmds);
      ch.forEach((p, i) => {
        const found = results[`d${i}`]?.[0];
        if (found?.ID) dealIdMap[p.email] = found.ID;
      });
    }

    // --- STEP 4: Batch-update existing deals (25 per batch) ---
    const withDeal = withContact.filter((p) => dealIdMap[p.email]);
    const noDeal = withContact.filter((p) => !dealIdMap[p.email]);
    noDeal.forEach((p) => errors.push({ id: p.subId, error: "Сделка не найдена в воронке" }));

    const updateChunks = chunk(withDeal, 40);
    for (const ch of updateChunks) {
      const cmds: Record<string, { method: string; params: Record<string, any> }> = {};
      ch.forEach((p, i) => {
        const fields: Record<string, any> = {};
        if (fieldId && p.qa) fields[fieldId] = p.qa;
        cmds[`u${i}`] = {
          method: "crm.deal.update",
          params: { id: dealIdMap[p.email], fields },
        };
      });
      const results = await bitrixBatch(bitrixUrl, cmds);
      ch.forEach((p, i) => {
        if (results[`u${i}`]) {
          sent++;
        } else {
          errors.push({ id: p.subId, error: "Ошибка обновления сделки в Bitrix" });
        }
      });
    }

    if (errors.length > 0) {
      const byReason: Record<string, number> = {};
      errors.forEach((e) => { byReason[e.error] = (byReason[e.error] ?? 0) + 1; });
      await logError({
        message: `CRM sync: не обновлено ${errors.length} из ${submissions.length} заявок (лендинг ${id})`,
        severity: sent === 0 ? "error" : "warning",
        url: `/admin/landings/${id}`,
        metadata: { landingId: id, sent, total: submissions.length, failedCount: errors.length, byReason },
      }).catch(() => {});
    }

    return NextResponse.json({ sent, total: submissions.length, errors });
  } catch (error) {
    console.error("send-to-crm error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
