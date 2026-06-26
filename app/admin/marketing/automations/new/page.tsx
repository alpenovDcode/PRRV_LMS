"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Workflow } from "lucide-react";
import {
  AutomationEditor,
  type AutomationFormData,
} from "../_components/automation-editor";

export default function MarketingAutomationNewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: AutomationFormData) => {
      const r = await apiClient.post("/admin/marketing/automations", data);
      return r.data.data as { id: string };
    },
    onSuccess: (created) => {
      toast.success("Автоматизация создана. Не забудьте включить.");
      queryClient.invalidateQueries({ queryKey: ["marketing-automations"] });
      router.push(`/admin/marketing/automations/${created.id}/edit`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось создать";
      toast.error(msg);
    },
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/automations"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку автоматизаций
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center">
          <Workflow className="h-6 w-6 text-pink-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Новая автоматизация</h1>
          <p className="text-gray-600">
            Триггер → последовательность шагов с задержками. После создания включите вручную.
          </p>
        </div>
      </div>

      <AutomationEditor
        submitLabel="Создать"
        isSubmitting={createMutation.isPending}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}
