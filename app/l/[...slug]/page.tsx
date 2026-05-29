import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingPageClient from "@/components/landing/LandingPageClient";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

// Реестр HTML-шаблонов (совпадает с /api/landings/html).
const HTML_TEMPLATES: Record<string, string> = {
  default: "landing_template.html",
  prepodavay: path.join("landings", "prepodavay.html"),
  "prepodavay-tg": path.join("landings", "prepodavay-tg.html"),
};

export const dynamic = "force-dynamic";

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug: slugArray } = await params;
  const sp = searchParams ? await searchParams : {};
  // ?sid=<TgSubscriber.id> — injected by bot flow nodes via {{client_id}}
  const subscriberId = typeof sp?.sid === "string" ? sp.sid : undefined;
  const slug = slugArray.join("/");
  
  const page = await prisma.landingPage.findUnique({
    where: { slug: decodeURIComponent(slug) },
    include: { blocks: { orderBy: { orderIndex: "asc" } } }
  });

  if (!page || !page.isPublished) {
    notFound();
  }

  // Handle immediate redirect if configured
  const settings = (page.settings as any) || {};
  if (settings.htmlTemplate?.redirectUrl) {
    let url = settings.htmlTemplate.redirectUrl;
    // Add protocol if missing
    if (url && !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/")) {
      url = "https://" + url;
    }
    if (url) {
       redirect(url);
    }
  }

  if ((page.settings as any)?.htmlTemplate?.enabled) {
    // Отдаём готовый HTML-шаблон ВСТРОЕННО в эту же страницу (без iframe).
    // Это нужно, чтобы трекинг-скрипт (tgtrack) был в исходнике /l/<slug>
    // и его видел проверяющий бот, а ссылки бота работали без обхода iframe.
    const tplKey: string = (page.settings as any).htmlTemplate?.template || "default";
    const tplFile = HTML_TEMPLATES[tplKey] || HTML_TEMPLATES.default;

    let raw = "";
    try {
      raw = fs.readFileSync(path.join(process.cwd(), "public", tplFile), "utf-8");
    } catch {
      notFound();
    }

    const styles = Array.from(raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map((m) => m[1])
      .join("\n");
    const scriptTags = Array.from(
      raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*>\s*<\/script>/gi)
    )
      .map((m) => `<script src="${m[1]}" type="text/javascript" defer></script>`)
      .join("");
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    // Вырезаем inline-скрипты (в top-документе они не нужны, iframe убран),
    // оставляем внешние трекинг-скрипты (scriptTags) — они в исходном HTML
    // видны боту tgtrack и исполняются при разборе страницы.
    const bodyInner = (bodyMatch ? bodyMatch[1] : raw).replace(
      /<script[\s\S]*?<\/script>/gi,
      ""
    );

    const inner = `<style>${styles}</style>${scriptTags}${bodyInner}`;
    return <div dangerouslySetInnerHTML={{ __html: inner }} />;
  }

  // Restore State from Cookie
  const cookieStore = await cookies();
  const userId = cookieStore.get("landing_session_user")?.value;
  let initialSubmissions: Record<string, any> = {};

  if (userId) {
     const submissions = await prisma.homeworkSubmission.findMany({
        where: { userId: userId, landingBlock: { pageId: page.id } },
        orderBy: { createdAt: "desc" }
     });
     
     // Map by blockId
     submissions.forEach((sub) => {
        if (sub.landingBlockId && !initialSubmissions[sub.landingBlockId]) {
           initialSubmissions[sub.landingBlockId] = sub;
        }
     });
  }

  // Filter blocks by OpenAt
  const now = new Date();
  const visibleBlocks = page.blocks.filter(block => {
     const settings: any = block.settings || {};
     if (!settings.openAt) return true;
     return new Date(settings.openAt) <= now;
  });

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
       <LandingPageClient
          slug={slug}
          blocks={visibleBlocks}
          initialSubmissions={initialSubmissions}
          settings={page.settings}
          subscriberId={subscriberId}
       />
    </div>
  );
}
