import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingPageClient from "@/components/landing/LandingPageClient";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.landingPage.findUnique({
    where: { slug: decodeURIComponent(slug) },
    include: { blocks: { orderBy: { orderIndex: "asc" } } }
  });

  if (!page || !page.isPublished) {
    notFound();
  }

  if ((page.settings as any)?.htmlTemplate?.enabled) {
    return (
      <iframe
        src={`/api/landings/html/${encodeURIComponent(slug)}`}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none", zIndex: 9999 }}
        title={page.title}
      />
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
       />
    </div>
  );
}
