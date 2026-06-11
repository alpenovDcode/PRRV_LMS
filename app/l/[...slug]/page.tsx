import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingPageClient from "@/components/landing/LandingPageClient";
import { cookies } from "next/headers";
import Script from "next/script";
import fs from "fs";
import path from "path";

// Реестр HTML-шаблонов (совпадает с /api/landings/html).
const HTML_TEMPLATES: Record<string, string> = {
  default: "landing_template.html",
  prepodavay: path.join("landings", "prepodavay.html"),
  "prepodavay-tg": path.join("landings", "prepodavay-tg.html"),
  "prrv-summer": path.join("landings", "prrv-summer.html"),
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

    // Внешние скрипты (Я.Метрика tag.js, tgtrack и т.п.) — собираем их
    // src'ы, рендерим через <Script> от Next.js. dangerouslySetInnerHTML
    // не исполняет встроенные <script>-теги: они попадают в DOM как
    // мёртвый текст, и трекеры не инициализируются.
    const externalScriptSrcs = Array.from(
      raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*>\s*<\/script>/gi)
    ).map((m) => m[1]);

    // Inline-скрипты из <head> — там сидят инициализаторы Я.Метрики/GA.
    // Получаем тело каждого <script>...</script>, чтобы прокинуть в next/script.
    const headMatch = raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headInlineScriptBodies = headMatch
      ? Array.from(
          headMatch[1].matchAll(
            /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
          )
        ).map((m) => m[1])
      : [];
    // <noscript> из head оставляем как есть — браузер сам выполнит его при
    // отключённом JS, dangerouslySetInnerHTML тут работает корректно.
    const headNoscripts = headMatch
      ? Array.from(headMatch[1].matchAll(/<noscript[\s\S]*?<\/noscript>/gi))
          .map((m) => m[0])
          .join("\n")
      : "";

    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyInner = (bodyMatch ? bodyMatch[1] : raw).replace(
      /<script[\s\S]*?<\/script>/gi,
      ""
    );

    const inner = `<style>${styles}</style>${headNoscripts}${bodyInner}`;
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: inner }} />
        {externalScriptSrcs.map((src, i) => (
          <Script
            key={`ext-${i}`}
            src={src}
            strategy="afterInteractive"
          />
        ))}
        {headInlineScriptBodies.map((body, i) => (
          <Script
            key={`inl-${i}`}
            id={`landing-inline-${i}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ))}
      </>
    );
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
