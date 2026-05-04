"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { QuestionChatThread } from "@/components/questions/chat-thread";
import { ChevronLeft } from "lucide-react";

export default function StudentQuestionThreadPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  if (!user) return <div className="p-8 text-gray-500">Загрузка...</div>;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <Link href="/dashboard/questions" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ChevronLeft className="h-4 w-4" /> Назад к списку
      </Link>
      <div className="border rounded-lg bg-white overflow-hidden h-[calc(100vh-180px)] min-h-[500px]">
        <QuestionChatThread questionId={params.id} viewerRole="student" viewerId={user.id} />
      </div>
    </div>
  );
}
