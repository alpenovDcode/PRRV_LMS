"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Filter, Send } from "lucide-react";
import { SegmentBuilder, type SegmentFiltersUI } from "../../_components/segment-builder";

interface SegmentDetail {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFiltersUI;
  contactCount: number;
  providerListId: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  campaigns: Array<{ id: string; name: string; status: string; finishedAt: string | null }>;
}

export default function MarketingSegmentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-segment", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/segments/${id}`);
      return r.data.data as SegmentDetail;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: {
      name: string;
      description: string | null;
      filters: Record<string, unknown>;
    }) => {
      const r = await apiClient.patch(`/admin/marketing/segments/${id}`, vars);
      return r.data.data as SegmentDetail;
    },
    onSuccess: () => {
      toast.success("Сегмент обновлён");
      queryClient.invalidateQueries({ queryKey: ["marketing-segment", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing-segments"] });
    },
    onError: () => toast.error("Не удалось сохранить"),
  });

  if (isLoading) {
    return <div className="container mx-auto max-w-5xl px-4 py-8 text-gray-500">Загрузка…</div>;
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin/marketing/segments" className="text-sm text-gray-600 hover:text-gray-900">
          ← К списку сегментов
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-gray-500">Сегмент не найден</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/segments"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку сегментов
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
            <Filter className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{data.name}</h1>
            <p className="text-gray-600">
              Сохранено{" "}
              {new Date(data.updatedAt).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              {data.providerListId && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Синхронизирован с провайдером
                </Badge>
              )}
            </p>
          </div>
        </div>
        <Link href={`/admin/marketing/campaigns/new?segmentId=${id}`}>
          <Button className="gap-2">
            <Send className="h-4 w-4" />
            Создать кампанию
          </Button>
        </Link>
      </div>

      {data.campaigns.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-gray-500 mb-2">Кампании, использующие сегмент:</div>
            <div className="flex flex-wrap gap-2">
              {data.campaigns.map((c) => (
                <Link key={c.id} href={`/admin/marketing/campaigns/${c.id}`}>
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-gray-50">
                    {c.name} · {c.status}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <SegmentBuilder
        initialName={data.name}
        initialDescription={data.description ?? ""}
        initialFilters={data.filters ?? {}}
        submitLabel="Сохранить изменения"
        isSubmitting={updateMutation.isPending}
        onSubmit={(vals) =>
          updateMutation.mutate({
            name: vals.name,
            description: vals.description,
            filters: vals.filters as Record<string, unknown>,
          })
        }
      />
    </div>
  );
}
