"use client";

import { useParams } from "next/navigation";
import { ChatPage } from "@/components/admin/tg/chat/chat-page";

export default function SubscriberChatPage() {
  const params = useParams<{ botId: string; subscriberId: string }>();
  return <ChatPage botId={params.botId} subscriberId={params.subscriberId} />;
}
