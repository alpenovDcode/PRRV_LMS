"use client";

import { use } from "react";
import { TemplateEditor } from "../../_components/template-editor";

export default function MarketingTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TemplateEditor templateId={id} />;
}
