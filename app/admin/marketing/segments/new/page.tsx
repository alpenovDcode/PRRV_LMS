"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Filter } from "lucide-react";
import { SegmentBuilder } from "../_components/segment-builder";

export default function MarketingSegmentNewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (vars: {
      name: string;
      description: string | null;
      filters: Record<string, unknown>;
    }) => {
      const r = await apiClient.post("/admin/marketing/segments", vars);
      return r.data.data as { id: string };
    },
    onSuccess: (created) => {
      toast.success("Сегмент создан");
      queryClient.invalidateQueries({ queryKey: ["marketing-segments"] });
      router.push(`/admin/marketing/segments/${created.id}/edit`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось создать сегмент";
      toast.error(msg);
    },
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/segments"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку сегментов
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
          <Filter className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Новый сегмент</h1>
          <p className="text-gray-600">
            Заполните фильтры — справа покажется размер. Сохраните, чтобы переиспользовать в кампаниях.
          </p>
        </div>
      </div>

      <SegmentBuilder
        submitLabel="Создать сегмент"
        isSubmitting={createMutation.isPending}
        onSubmit={(data) =>
          createMutation.mutate({
            name: data.name,
            description: data.description,
            filters: data.filters as Record<string, unknown>,
          })
        }
      />
    </div>
  );
}
