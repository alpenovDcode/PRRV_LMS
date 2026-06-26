"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  Search,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserX,
  Filter as FilterIcon,
  Trash2,
  Tag as TagIcon,
  UserCheck,
} from "lucide-react";

// Зафиксированные списки. Те же что в /admin/broadcasts/page.tsx — чтобы UI был
// узнаваем для маркетолога, который привык к ГК.
const ROLES = [
  { value: "student", label: "Студенты" },
  { value: "curator", label: "Кураторы" },
  { value: "admin", label: "Администраторы" },
];
const TARIFFS = [
  { value: "VR", label: "Востребованный" },
  { value: "LR", label: "Лидер рынка" },
  { value: "SR", label: "Самостоятельный" },
];
const TRACKS = [
  "Заполнить расписание",
  "Стать репетитором",
  "Перейти в онлайн",
  "Повысить чек",
  "Перейти на группы",
];
const SUBSCRIPTIONS = [
  { value: "all", label: "Все" },
  { value: "subscribed", label: "Подписаны" },
  { value: "unsubscribed", label: "Отписаны" },
];

interface ContactRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  tariff: string | null;
  track: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  emailValidated: boolean;
  marketingOptOut: boolean;
  unsubscribedAt: string | null;
  externalContactId: string | null;
  emailTags: string[] | null;
  isBlocked: boolean;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MarketingContactsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [tariffs, setTariffs] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [subscription, setSubscription] = useState("all");
  const [validated, setValidated] = useState<"" | "true" | "false">("");
  const [tagsInput, setTagsInput] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Bulk selection (на текущей странице).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");

  const tags = useMemo(
    () => tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    [tagsInput]
  );

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roles.length) params.set("roles", roles.join(","));
    if (tariffs.length) params.set("tariffs", tariffs.join(","));
    if (tracks.length) params.set("tracks", tracks.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (subscription !== "all") params.set("subscription", subscription);
    if (validated) params.set("validated", validated);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [search, roles, tariffs, tracks, tags, subscription, validated, page]);

  const { data, isFetching } = useQuery({
    queryKey: ["marketing-contacts", queryParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/contacts?${queryParams}`);
      return r.data.data as { items: ContactRow[]; total: number; page: number; limit: number };
    },
    placeholderData: (prev) => prev,
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (vars: { id: string; subscribe: boolean }) => {
      const r = await apiClient.post(
        `/admin/marketing/contacts/${vars.id}/unsubscribe`,
        { subscribe: vars.subscribe }
      );
      return r.data.data;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.subscribe ? "Контакт подписан обратно" : "Контакт отписан");
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
    onError: () => {
      toast.error("Не удалось изменить подписку");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (vars: {
      action: "unsubscribe" | "subscribe" | "add_tag" | "remove_tag";
      tag?: string;
    }) => {
      const r = await apiClient.post("/admin/marketing/contacts/bulk", {
        ids: Array.from(selected),
        action: vars.action,
        tag: vars.tag,
      });
      return r.data.data as { affected: number; requested: number };
    },
    onSuccess: (data, vars) => {
      const labels: Record<string, string> = {
        unsubscribe: "Отписано",
        subscribe: "Подписано обратно",
        add_tag: "Тег добавлен",
        remove_tag: "Тег убран",
      };
      toast.success(`${labels[vars.action]} контактов: ${data.affected} из ${data.requested}`);
      setSelected(new Set());
      setBulkTag("");
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
    onError: () => toast.error("Bulk-операция упала"),
  });

  const exportUrl = `/api/admin/marketing/contacts/export?${queryParams.replace(/&?page=\d+/, "").replace(/&?limit=\d+/, "")}`;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const allOnPageSelected = items.length > 0 && items.every((it) => selected.has(it.id));
  const someOnPageSelected = items.some((it) => selected.has(it.id));

  function toggleAllOnPage() {
    const next = new Set(selected);
    if (allOnPageSelected) {
      for (const it of items) next.delete(it.id);
    } else {
      for (const it of items) next.add(it.id);
    }
    setSelected(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function resetFilters() {
    setSearch("");
    setSearchDraft("");
    setRoles([]);
    setTariffs([]);
    setTracks([]);
    setTagsInput("");
    setSubscription("all");
    setValidated("");
    setPage(1);
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Контакты</h1>
            <p className="text-gray-600">
              База подписчиков. Те же пользователи что и в LMS, но с маркетинговыми тегами и статусом подписки.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/marketing/contacts/import">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Импорт CSV
            </Button>
          </Link>
          <a href={exportUrl} target="_blank" rel="noopener">
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Экспорт CSV
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4" />
            Фильтры
          </CardTitle>
          <CardDescription>
            Сужайте базу для просмотра, экспорта или (в Спринте 2) сохранения как сегмент.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="flex-1 w-full">
              <Label htmlFor="search" className="text-xs text-gray-600">
                Поиск по email или имени
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="alex@…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSearch(searchDraft);
                      setPage(1);
                    }
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <Button
              onClick={() => {
                setSearch(searchDraft);
                setPage(1);
              }}
            >
              Найти
            </Button>
            <Button variant="ghost" onClick={resetFilters} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Сбросить
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-gray-600">Роль</Label>
              <div className="mt-1 space-y-1">
                {ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={roles.includes(r.value)}
                      onCheckedChange={() => {
                        setRoles(toggle(roles, r.value));
                        setPage(1);
                      }}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-600">Тариф</Label>
              <div className="mt-1 space-y-1">
                {TARIFFS.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={tariffs.includes(t.value)}
                      onCheckedChange={() => {
                        setTariffs(toggle(tariffs, t.value));
                        setPage(1);
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-600">Трек</Label>
              <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                {TRACKS.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={tracks.includes(t)}
                      onCheckedChange={() => {
                        setTracks(toggle(tracks, t));
                        setPage(1);
                      }}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-600">Подписка</Label>
                <div className="mt-1 flex gap-1">
                  {SUBSCRIPTIONS.map((s) => (
                    <Button
                      key={s.value}
                      variant={subscription === s.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSubscription(s.value);
                        setPage(1);
                      }}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-600">Валидация</Label>
                <div className="mt-1 flex gap-1">
                  <Button
                    variant={validated === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setValidated("");
                      setPage(1);
                    }}
                  >
                    Все
                  </Button>
                  <Button
                    variant={validated === "true" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setValidated("true");
                      setPage(1);
                    }}
                  >
                    Валидированы
                  </Button>
                  <Button
                    variant={validated === "false" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setValidated("false");
                      setPage(1);
                    }}
                  >
                    Невалидированы
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="tags" className="text-xs text-gray-600">
                  Теги (через запятую, AND)
                </Label>
                <Input
                  id="tags"
                  placeholder="tariff:VR, track:music"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-blue-900">
              Выбрано: {selected.size} {pluralize(selected.size, "контакт", "контакта", "контактов")}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={bulkMutation.isPending}
              onClick={() => {
                if (window.confirm(`Отписать ${selected.size} контактов? Это пушится в провайдер.`)) {
                  bulkMutation.mutate({ action: "unsubscribe" });
                }
              }}
            >
              <UserX className="h-3 w-3" />
              Отписать
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate({ action: "subscribe" })}
            >
              <UserCheck className="h-3 w-3" />
              Подписать обратно
            </Button>
            <div className="flex items-center gap-1">
              <Input
                placeholder="тег"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                className="h-8 w-32 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!bulkTag.trim() || bulkMutation.isPending}
                onClick={() => bulkMutation.mutate({ action: "add_tag", tag: bulkTag.trim() })}
              >
                <TagIcon className="h-3 w-3" />
                Добавить тег
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!bulkTag.trim() || bulkMutation.isPending}
                onClick={() => bulkMutation.mutate({ action: "remove_tag", tag: bulkTag.trim() })}
              >
                Убрать тег
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="ml-auto"
            >
              Сбросить выбор
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {total.toLocaleString("ru-RU")} {pluralize(total, "контакт", "контакта", "контактов")}
            </CardTitle>
            <CardDescription>
              Страница {page} из {totalPages}
            </CardDescription>
          </div>
          {isFetching && <span className="text-xs text-gray-400">обновление…</span>}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <Checkbox
                      checked={
                        allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAllOnPage}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Email / Имя</th>
                  <th className="px-4 py-3 text-left">Роль</th>
                  <th className="px-4 py-3 text-left">Тариф</th>
                  <th className="px-4 py-3 text-left">Трек</th>
                  <th className="px-4 py-3 text-left">Статус</th>
                  <th className="px-4 py-3 text-left">Теги</th>
                  <th className="px-4 py-3 text-left">Создан</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && !isFetching && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Нет контактов под текущие фильтры
                    </td>
                  </tr>
                )}
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggleOne(row.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/marketing/contacts/${row.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {row.email}
                      </Link>
                      {row.fullName && (
                        <div className="text-xs text-gray-500">{row.fullName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {ROLES.find((r) => r.value === row.role)?.label ?? row.role}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.tariff ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.track ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.marketingOptOut ? (
                          <Badge variant="secondary" className="bg-red-50 text-red-700 hover:bg-red-50">
                            Отписан
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            Подписан
                          </Badge>
                        )}
                        {row.emailValidated && (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Валид
                          </Badge>
                        )}
                        {row.isBlocked && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                            Заблокирован
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(row.emailTags ?? []).slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {(row.emailTags ?? []).length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{(row.emailTags ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          unsubscribeMutation.mutate({
                            id: row.id,
                            subscribe: row.marketingOptOut,
                          })
                        }
                        disabled={unsubscribeMutation.isPending}
                        className={
                          row.marketingOptOut
                            ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            : "text-red-600 hover:text-red-700 hover:bg-red-50"
                        }
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        {row.marketingOptOut ? "Подписать" : "Отписать"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">
          Показано {items.length === 0 ? 0 : (page - 1) * limit + 1}–
          {(page - 1) * limit + items.length} из {total.toLocaleString("ru-RU")}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Назад
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
