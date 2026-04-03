import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug: slugArray } = await params;
  const slug = slugArray.join("/");

  const page = await prisma.landingPage.findUnique({
    where: { slug: decodeURIComponent(slug) },
  });

  if (!page || !page.isPublished) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const settings = (page.settings as any) || {};
  if (!settings.htmlTemplate?.enabled) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const templatePath = path.join(process.cwd(), "public", "landing_template.html");
  let html: string;
  try {
    html = fs.readFileSync(templatePath, "utf-8");
  } catch {
    return new NextResponse("Template not found", { status: 500 });
  }

  const buttons = settings.htmlTemplate?.buttons || {};
  const mergedButtons = {
    heroCta:   { text: "УЗНАЕТЕ ДАЛЬШЕ",                  href: "#", ...buttons.heroCta },
    sprintCta1:{ text: "ЗАБРАТЬ СПРИНТ ЗА 900 РУБЛЕЙ",    href: "#", ...buttons.sprintCta1 },
    sprintCta2:{ text: "ЗАЙТИ НА СПРИНТ ЗА 900 РУБЛЕЙ",   href: "#", ...buttons.sprintCta2 },
    finalCta:  { text: "ЗАЙТИ НА СПРИНТ ЗА 900 РУБЛЕЙ",   href: "#", ...buttons.finalCta },
  };

  // Inject override before </body> — runs after the template's own BUTTONS declaration
  const overrideScript = `<script>var BUTTONS = ${JSON.stringify(mergedButtons)};</script>`;
  html = html.replace("</body>", overrideScript + "\n</body>");

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
