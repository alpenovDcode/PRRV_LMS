"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CuratorLayout } from "@/components/layouts/curator-layout";
import { QuestionChatThread } from "@/components/questions/chat-thread";
import { ChevronLeft } from "lucide-react";

export default function CuratorQuestionThreadPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  return (
    <CuratorLayout>
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <Link href="/curator/questions" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ChevronLeft className="h-4 w-4" /> К списку вопросов
        </Link>
        <div className="border rounded-lg bg-white overflow-hidden h-[calc(100vh-180px)] min-h-[500px]">
          {user && (
            <QuestionChatThread questionId={params.id} viewerRole={(user.role as any) || "curator"} viewerId={user.id} />
          )}
        </div>
      </div>
    </CuratorLayout>
  );
}
