import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingForm from "@/components/landing/LandingForm";

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.landingPage.findUnique({
    where: { slug: slug },
    include: { blocks: { orderBy: { orderIndex: "asc" } } }
  });

  if (!page || !page.isPublished) {
    notFound();
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
       <div className="max-w-3xl mx-auto py-12 px-4 space-y-12">
          {visibleBlocks.map((block) => (
             <div key={block.id} className="landing-block">
                
                {block.type === "text" && (
                   <div 
                     className="prose prose-lg max-w-none"
                     dangerouslySetInnerHTML={{ __html: (block.content as any).html }} 
                   />
                )}

                {block.type === "video" && (
                   <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
                      <iframe
                         src={`https://customer-2h654e7z77942781.cloudflarestream.com/${(block.content as any).videoId}/iframe`}
                         className="w-full h-full"
                         allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                         allowFullScreen={true}
                      ></iframe>
                   </div>
                )}

                {block.type === "form" && (
                   <div className="bg-gray-50 border rounded-2xl p-6 md:p-8">
                      <LandingForm block={block} />
                   </div>
                )}

             </div>
          ))}
       </div>
    </div>
  );
}
