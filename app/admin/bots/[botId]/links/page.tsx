"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface Link {
  id: string;
  slug: string;
  name: string;
  startFlowId: string | null;
  applyTags: string[];
  utm: Record<string, string>;
  clickCount: number;
  subscribeCount: number;
  createdAt: string;
  expiresAt: string | null;
}

export default function LinksPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [startFlowId, setStartFlowId] = useState("");

  /**
   * Генератор «умной» ссылки. Выбранная базовая ссылка (slug) + произвольный
   * набор UTM из формы → готовый URL вида prrv.tech/g/<bot>/<slug>?utm_*.
   * Этот URL ведёт на наш редиректор, который сохраняет UTM в Redis и
   * редиректит на t.me/<bot>?start=<token>.
   */
  const [smartLink, setSmartLink] = useState<Link | null>(null);
  const [smartUtm, setSmartUtm] = useState({
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
  });

  /** Текущий origin для сборки абсолютных URL ссылок-генераторов. */
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://prrv.tech";

  function buildSmartUrl(linkSlug: string, utm: Record<string, string>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(utm)) {
      const value = v.trim();
      if (value) qs.set(k, value);
    }
    const tail = qs.toString();
    return `${origin}/g/${data?.botUsername ?? ""}/${encodeURIComponent(linkSlug)}${
      tail ? `?${tail}` : ""
    }`;
  }

  const { data } = useQuery({
    queryKey: ["tg-links", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/tracking-links`);
      return r.data?.data as { links: Link[]; botUsername: string };
    },
  });

  const { data: flowsList } = useQuery({
    queryKey: ["tg-flows-list", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows`);
      return (r.data?.data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const utm: Record<string, string> = {};
      if (utmSource) utm.utm_source = utmSource;
      if (utmCampaign) utm.utm_campaign = utmCampaign;
      if (utmContent) utm.utm_content = utmContent;
      return apiClient.post(`/admin/tg/bots/${botId}/tracking-links`, {
        slug,
        name,
        applyTags: tagsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        utm,
        startFlowId: startFlowId || null,
      });
    },
    onSuccess: () => {
      toast.success("Ссылка создана");
      setOpen(false);
      setSlug("");
      setName("");
      setTagsRaw("");
      setUtmSource("");
      setUtmCampaign("");
      setUtmContent("");
      setStartFlowId("");
      queryClient.invalidateQueries({ queryKey: ["tg-links", botId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Новая ссылка
        </Button>
      </div>

      {!data?.links.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Пока нет ссылок. Создайте слаг и привяжите UTM/теги.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="text-left p-3">Slug</th>
                  <th className="text-left p-3">Название</th>
                  <th className="text-left p-3">Теги</th>
                  <th className="text-left p-3">UTM</th>
                  <th className="text-right p-3">Клики</th>
                  <th className="text-right p-3">Подписок</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.links.map((l) => {
                  const url = `https://t.me/${data.botUsername}?start=${encodeURIComponent(
                    l.slug
                  )}`;
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{l.slug}</td>
                      <td className="p-3">{l.name}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {l.applyTags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {Object.entries(l.utm)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(" · ") || "—"}
                      </td>
                      <td className="p-3 text-right">{l.clickCount}</td>
                      <td className="p-3 text-right">{l.subscribeCount}</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(url);
                              toast.success("Скопировано");
                            }}
                            title={`Скопировать обычную ссылку: ${url}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSmartLink(l);
                              // Префиллим базовыми UTM ссылки — удобно
                              // отталкиваться от них и при необходимости
                              // перебить под конкретную кампанию.
                              setSmartUtm({
                                utm_source: l.utm.utm_source ?? "",
                                utm_medium: l.utm.utm_medium ?? "",
                                utm_campaign: l.utm.utm_campaign ?? "",
                                utm_content: l.utm.utm_content ?? "",
                                utm_term: l.utm.utm_term ?? "",
                              });
                            }}
                            title="Сгенерировать умную ссылку с UTM"
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая ссылка</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Slug (A-Z, 0-9, _ - ; до 48 симв.)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="promo15" />
              {data?.botUsername && slug && (
                <p className="mt-1 text-xs text-muted-foreground break-all">
                  https://t.me/{data.botUsername}?start={slug}
                </p>
              )}
            </div>
            <div>
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Теги при переходе (через запятую)</Label>
              <Input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="leadmagnet, source_instagram"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>utm_source</Label>
                <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
              </div>
              <div>
                <Label>utm_campaign</Label>
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} />
              </div>
              <div>
                <Label>utm_content</Label>
                <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Сценарий на старт</Label>
              <select
                className="w-full rounded border px-2 py-2 text-sm"
                value={startFlowId}
                onChange={(e) => setStartFlowId(e.target.value)}
              >
                <option value="">— не запускать —</option>
                {(flowsList ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => create.mutate()} disabled={!slug || !name || create.isPending}>
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Генератор «умной» UTM-ссылки ─────────────────────────────── */}
      <Dialog
        open={!!smartLink}
        onOpenChange={(o) => {
          if (!o) setSmartLink(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" /> Умная ссылка
              {smartLink && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  на «{smartLink.name}» ({smartLink.slug})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {smartLink && (
            <div className="space-y-4">
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                Telegram отбрасывает query-параметры из <code>t.me/?start=…</code> —
                поэтому UTM передаются через наш редиректор. Кликай на ссылку
                под формой и копируй её — она автоматически обновляется.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    ["utm_source", "Источник (откуда)"],
                    ["utm_medium", "Канал (как)"],
                    ["utm_campaign", "Кампания"],
                    ["utm_content", "Контент / креатив"],
                    ["utm_term", "Ключевое слово"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </Label>
                    <Input
                      value={smartUtm[key]}
                      onChange={(e) =>
                        setSmartUtm({ ...smartUtm, [key]: e.target.value })
                      }
                      placeholder={key}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Готовая ссылка
                </Label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {buildSmartUrl(smartLink.slug, smartUtm)}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const url = buildSmartUrl(smartLink.slug, smartUtm);
                      navigator.clipboard.writeText(url);
                      toast.success("Скопировано");
                    }}
                    title="Скопировать"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Поведение: при клике LMS сохраняет UTM в Redis под одноразовым
                токеном, редиректит на <code>t.me/{data?.botUsername}?start=…</code>.
                Когда пользователь жмёт «Старт», UTM применяются к подписчику
                в <code>client.utm_source</code> и т.д. и уезжают в карточку
                подписчика и в Bitrix24 (если настроен синк по этим полям).
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setSmartLink(null)}>Готово</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
