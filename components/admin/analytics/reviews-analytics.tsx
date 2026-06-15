"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from "recharts";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { RefreshCw, Star, ExternalLink, MessageSquare } from "lucide-react";
import { rangeToFromDate } from "@/lib/analytics-range";

interface ReviewRow {
  id: string;
  source: string;
  author: string;
  rating: number;
  text: string;
  url?: string;
  publishedAt: string;
  businessResponse?: string | null;
}

interface SentimentData {
  positive: number;
  neutral: number;
  negative: number;
}

interface ReviewsData {
  total: number;
  dbTotal: number;
  dbTotals: { source: string; count: number; latestPublishedAt: string | null }[];
  avgRating: number | null;
  respondedTotal: number;
  responseRate: number;
  sentiment: SentimentData;
  perSource: {
    source: string;
    count: number;
    avgRating: number | null;
    respondedCount: number;
    responseRate: number;
  }[];
  ratingDistribution: { rating: number; count: number }[];
  perMonth: { month: string; otzovik: number; yandex_maps: number }[];
  lastFetchedAt: string | null;
  reviews: ReviewRow[];
}

const SOURCE_LABELS: Record<string, string> = {
  otzovik: "Otzovik",
  yandex_maps: "Яндекс Карты",
};

const RATING_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < full ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

function SentimentBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className={color}>{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: color === "text-green-600" ? "#16a34a" : color === "text-yellow-600" ? "#ca8a04" : "#dc2626",
          }}
        />
      </div>
    </div>
  );
}

export function ReviewsAnalytics({ range = "all" }: { range?: string }) {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<ReviewsData>({
    queryKey: ["admin-reviews-analytics", sourceFilter, range],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      const fromDate = rangeToFromDate(range);
      if (fromDate) params.set("from", fromDate.toISOString());
      const res = await fetch(`/api/admin/analytics/reviews?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Ошибка");
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/reviews/sync", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Ошибка синхронизации");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews-analytics"] });
    },
  });

  const monthChartData = useMemo(() => {
    if (!data?.perMonth) return [];
    return data.perMonth.map((m) => ({
      name: m.month,
      Otzovik: m.otzovik,
      "Яндекс Карты": m.yandex_maps,
    }));
  }, [data]);

  const ratingChartData = useMemo(() => {
    if (!data?.ratingDistribution) return [];
    return data.ratingDistribution.map((r, i) => ({
      name: `${r.rating}★`,
      count: r.count,
      fill: RATING_COLORS[i] ?? "#94a3b8",
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-destructive py-4">Не удалось загрузить данные отзывов</p>;
  }

  const sentimentTotal = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все источники</SelectItem>
            <SelectItem value="otzovik">Otzovik</SelectItem>
            <SelectItem value="yandex_maps">Яндекс Карты</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Синхронизация..." : "Обновить отзывы"}
        </Button>

        {data.lastFetchedAt && (
          <span className="text-xs text-muted-foreground">
            Обновлено: {format(new Date(data.lastFetchedAt), "dd.MM.yyyy HH:mm", { locale: ru })}
          </span>
        )}
        {syncMutation.isError && (
          <span className="text-xs text-destructive">{(syncMutation.error as Error).message}</span>
        )}
        {syncMutation.isSuccess && (
          <span className="text-xs text-green-600">Синхронизация завершена</span>
        )}
      </div>

      {/* Информация о фильтрации */}
      {range !== "all" && data.dbTotal > data.total && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 px-4 py-2.5 text-sm text-blue-900 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-200">
          Фильтр «{range === "7d" ? "Последние 7 дней" : range === "30d" ? "Последние 30 дней" : "Последние 3 месяца"}»
          показывает <b>{data.total}</b> из <b>{data.dbTotal}</b> отзывов в базе.
          Чтобы увидеть все отзывы, выберите «За все время».
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {range === "all" ? "Всего отзывов" : "Отзывов за период"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.total}
              {range !== "all" && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {data.dbTotal}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.perSource.map((s) => (
                <Badge key={s.source} variant="secondary" className="text-xs">
                  {SOURCE_LABELS[s.source] ?? s.source}: {s.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Средняя оценка</CardTitle>
          </CardHeader>
          <CardContent>
            {data.avgRating !== null ? (
              <>
                <div className="text-2xl font-bold">{data.avgRating}<span className="text-base font-normal text-muted-foreground"> / 5</span></div>
                <StarRating rating={data.avgRating} />
              </>
            ) : (
              <div className="text-2xl text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ответы на отзывы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.respondedTotal}</div>
            <div className="text-sm text-muted-foreground">
              {data.responseRate}% отзывов получили ответ
            </div>
            <div className="mt-1 space-y-0.5">
              {data.perSource.map((s) => s.respondedCount > 0 && (
                <div key={s.source} className="text-xs text-muted-foreground flex justify-between">
                  <span>{SOURCE_LABELS[s.source] ?? s.source}</span>
                  <span>{s.respondedCount} ({s.responseRate}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Тональность</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            <SentimentBar label="Положительные" count={data.sentiment.positive} total={sentimentTotal} color="text-green-600" />
            <SentimentBar label="Нейтральные" count={data.sentiment.neutral} total={sentimentTotal} color="text-yellow-600" />
            <SentimentBar label="Негативные" count={data.sentiment.negative} total={sentimentTotal} color="text-red-600" />
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {data.total > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Распределение оценок</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratingChartData} barSize={36}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} отзывов`, "Кол-во"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {ratingChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {monthChartData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Динамика по месяцам</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Otzovik" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Яндекс Карты" stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Reviews Table */}
      {data.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Отзывы ещё не загружены. Нажмите «Обновить отзывы» чтобы загрузить данные.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Все отзывы</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="min-w-[100px]">Источник</TableHead>
                    <TableHead className="min-w-[120px]">Автор</TableHead>
                    <TableHead className="text-center min-w-[90px]">Оценка</TableHead>
                    <TableHead className="min-w-[300px]">Отзыв</TableHead>
                    <TableHead className="min-w-[100px]">Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reviews.map((r) => (
                    <ReviewTableRow key={r.id} review={r} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewTableRow({ review }: { review: ReviewRow }) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const MAX = 120;

  return (
    <>
      <TableRow>
        <TableCell>
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {SOURCE_LABELS[review.source] ?? review.source}
          </Badge>
        </TableCell>
        <TableCell className="text-sm font-medium">{review.author}</TableCell>
        <TableCell className="text-center">
          <StarRating rating={review.rating} />
        </TableCell>
        <TableCell className="text-sm text-muted-foreground max-w-sm">
          {review.text.length > MAX && !textExpanded ? (
            <span>
              {review.text.slice(0, MAX)}…{" "}
              <button type="button" onClick={() => setTextExpanded(true)} className="text-primary underline decoration-dotted text-xs">читать</button>
            </span>
          ) : (
            <span>
              {review.text}
              {review.text.length > MAX && (
                <button type="button" onClick={() => setTextExpanded(false)} className="ml-1 text-muted-foreground underline text-xs">скрыть</button>
              )}
            </span>
          )}
          {review.businessResponse && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setResponseExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <MessageSquare className="h-3 w-3" />
                {responseExpanded ? "Скрыть ответ" : "Ответ организации"}
              </button>
              {responseExpanded && (
                <div className="mt-1.5 rounded-md bg-muted/50 border-l-2 border-primary/40 px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
                  {review.businessResponse}
                </div>
              )}
            </div>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          <div>{format(new Date(review.publishedAt), "dd.MM.yyyy", { locale: ru })}</div>
          {review.url && (
            <a href={review.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" />
              открыть
            </a>
          )}
        </TableCell>
      </TableRow>
    </>
  );
}
