"use client";

import { CuratorLayout } from "@/components/layouts/curator-layout";
import { QuestionsInbox } from "@/components/questions/questions-inbox";

export default function CuratorQuestionsPage() {
  return (
    <CuratorLayout>
      <div className="h-[calc(100vh-64px)]">
        <QuestionsInbox />
      </div>
    </CuratorLayout>
  );
}
