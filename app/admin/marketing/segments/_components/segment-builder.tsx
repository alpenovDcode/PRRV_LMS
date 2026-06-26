"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Filter as FilterIcon,
  GraduationCap,
  Activity,
  Calendar,
  Tag,
  Loader2,
  ShieldCheck,
  X,
  Mail,
  ShoppingCart,
} from "lucide-react";

/**
 * Структура фильтров — зеркало lib/email/segments/compile-filters.ts.
 * Все поля опциональны: empty array / undefined / null означает «без условия».
 */
export interface SegmentFiltersUI {
  search?: string;
  roles?: string[];
  tariffs?: string[];
  tracks?: string[];
  groupIds?: string[];
  enrolledInCourseIds?: string[];
  notEnrolledInCourseIds?: string[];
  lastActiveDays?: number;
  inactiveDays?: number;
  createdAfter?: string;
  createdBefore?: string;
  subscription?: "all" | "subscribed" | "unsubscribed";
  emailValidated?: boolean;
  tags?: string[];
  keywordsAny?: string[];
  // Поведенческие.
  openedCampaignIds?: string[];
  notOpenedCampaignIds?: string[];
  clickedCampaignIds?: string[];
  notClickedCampaignIds?: string[];
  // Покупки.
  purchasedAny?: boolean;
  purchasedOfferIds?: string[];
  notPurchasedOfferIds?: string[];
  purchasedSinceDaysAgo?: number;
}

// Та же фиксированная палитра что и в /admin/broadcasts — узнаваемо для маркетолога.
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

interface PreviewData {
  count: number;
  sample: Array<{
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    tariff: string | null;
    track: string | null;
    marketingOptOut: boolean;
  }>;
}

interface SegmentBuilderProps {
  initialName?: string;
  initialDescription?: string;
  initialFilters?: SegmentFiltersUI;
  submitLabel?: string;
  isSubmitting?: boolean;
  onSubmit: (data: { name: string; description: string | null; filters: SegmentFiltersUI }) => void;
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const list = arr ?? [];
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Базовая debounce-обёртка вокруг значения. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function SegmentBuilder({
  initialName = "",
  initialDescription = "",
  initialFilters = { subscription: "subscribed" },
  submitLabel = "Сохранить",
  isSubmitting = false,
  onSubmit,
}: SegmentBuilderProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [filters, setFilters] = useState<SegmentFiltersUI>(initialFilters);

  const [tagsInput, setTagsInput] = useState((initialFilters.tags ?? []).join(", "));
  const [keywordsInput, setKeywordsInput] = useState((initialFilters.keywordsAny ?? []).join(", "));

  // Сбор финальных filters перед preview/submit.
  const filtersForApi = useFiltersWithDerived(filters, tagsInput, keywordsInput);
  const debounced = useDebounced(filtersForApi, 300);

  const { data: courses } = useQuery({
    queryKey: ["admin-courses-options"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/courses?limit=200");
      const list = (r.data.data?.items ?? r.data.data ?? []) as Array<{ id: string; title: string }>;
      return list;
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["admin-groups-options"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/groups");
      const list = (Array.isArray(r.data.data)
        ? r.data.data
        : r.data.data?.groups ?? r.data.data?.items ?? []) as Array<{ id: string; name: string }>;
      return list;
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["admin-marketing-campaigns-options"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/campaigns?limit=50");
      const list = (r.data.data?.items ?? []) as Array<{ id: string; name: string; status: string }>;
      // Показываем только те которые реально отправлялись — по ним имеет смысл фильтровать.
      return list.filter((c) => ["sending", "sent", "paused"].includes(c.status));
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["admin-offers-options"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/offers?limit=200");
      const list = (r.data.data?.items ?? r.data.data ?? []) as Array<{ id: string; title: string }>;
      return list;
    },
  });

  const { data: preview, isFetching: previewLoading } = useQuery<PreviewData>({
    queryKey: ["marketing-segment-preview", JSON.stringify(debounced)],
    queryFn: async () => {
      const r = await apiClient.post("/admin/marketing/segments/preview", { filters: debounced });
      return r.data.data;
    },
    placeholderData: (prev) => prev,
  });

  function handleSubmit() {
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      filters: filtersForApi,
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6 items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Название и описание</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="seg-name">Название *</Label>
              <Input
                id="seg-name"
                placeholder="Активные студенты на VR без отписки"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="seg-desc">Описание (опционально)</Label>
              <Textarea
                id="seg-desc"
                placeholder="Кратко: зачем этот сегмент, как его использовать в кампаниях"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <FilterSection title="Демография" icon={Users}>
          <FilterGroup label="Роль">
            {ROLES.map((r) => (
              <CheckboxRow
                key={r.value}
                label={r.label}
                checked={filters.roles?.includes(r.value) ?? false}
                onChange={() => setFilters({ ...filters, roles: toggle(filters.roles, r.value) })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Тариф">
            {TARIFFS.map((t) => (
              <CheckboxRow
                key={t.value}
                label={t.label}
                checked={filters.tariffs?.includes(t.value) ?? false}
                onChange={() => setFilters({ ...filters, tariffs: toggle(filters.tariffs, t.value) })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Трек">
            {TRACKS.map((t) => (
              <CheckboxRow
                key={t}
                label={t}
                checked={filters.tracks?.includes(t) ?? false}
                onChange={() => setFilters({ ...filters, tracks: toggle(filters.tracks, t) })}
              />
            ))}
          </FilterGroup>
        </FilterSection>

        <FilterSection title="Группы и курсы" icon={GraduationCap}>
          {groups && groups.length > 0 && (
            <FilterGroup label="Группы">
              <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                {groups.map((g) => (
                  <CheckboxRow
                    key={g.id}
                    label={g.name}
                    checked={filters.groupIds?.includes(g.id) ?? false}
                    onChange={() =>
                      setFilters({ ...filters, groupIds: toggle(filters.groupIds, g.id) })
                    }
                  />
                ))}
              </div>
            </FilterGroup>
          )}
          {courses && courses.length > 0 && (
            <>
              <FilterGroup label="Записан на курсы (OR)">
                <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                  {courses.map((c) => (
                    <CheckboxRow
                      key={c.id}
                      label={c.title}
                      checked={filters.enrolledInCourseIds?.includes(c.id) ?? false}
                      onChange={() =>
                        setFilters({
                          ...filters,
                          enrolledInCourseIds: toggle(filters.enrolledInCourseIds, c.id),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup label="НЕ записан на курсы">
                <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                  {courses.map((c) => (
                    <CheckboxRow
                      key={c.id}
                      label={c.title}
                      checked={filters.notEnrolledInCourseIds?.includes(c.id) ?? false}
                      onChange={() =>
                        setFilters({
                          ...filters,
                          notEnrolledInCourseIds: toggle(filters.notEnrolledInCourseIds, c.id),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterGroup>
            </>
          )}
        </FilterSection>

        <FilterSection title="Активность" icon={Activity}>
          <FilterGroup label="Был активен в последние N дней">
            <Input
              type="number"
              min={1}
              max={3650}
              placeholder="например 30"
              value={filters.lastActiveDays ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  lastActiveDays: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </FilterGroup>
          <FilterGroup label="НЕ был активен N дней (для реактивации)">
            <Input
              type="number"
              min={1}
              max={3650}
              placeholder="например 60"
              value={filters.inactiveDays ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  inactiveDays: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </FilterGroup>
        </FilterSection>

        <FilterSection title="Дата регистрации" icon={Calendar}>
          <FilterGroup label="С">
            <Input
              type="date"
              value={(filters.createdAfter ?? "").slice(0, 10)}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  createdAfter: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
            />
          </FilterGroup>
          <FilterGroup label="По">
            <Input
              type="date"
              value={(filters.createdBefore ?? "").slice(0, 10)}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  createdBefore: e.target.value
                    ? new Date(e.target.value + "T23:59:59.999Z").toISOString()
                    : undefined,
                })
              }
            />
          </FilterGroup>
        </FilterSection>

        <FilterSection title="Подписка и теги" icon={Tag}>
          <FilterGroup label="Статус подписки">
            <div className="flex gap-1 flex-wrap">
              {(["all", "subscribed", "unsubscribed"] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={(filters.subscription ?? "subscribed") === v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilters({ ...filters, subscription: v })}
                >
                  {v === "all" ? "Все" : v === "subscribed" ? "Подписаны" : "Отписаны"}
                </Button>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup label="Валидация email">
            <div className="flex gap-1 flex-wrap">
              <Button
                type="button"
                variant={filters.emailValidated === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, emailValidated: undefined })}
              >
                Любая
              </Button>
              <Button
                type="button"
                variant={filters.emailValidated === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, emailValidated: true })}
                className="gap-1"
              >
                <ShieldCheck className="h-3 w-3" />
                Валидированы
              </Button>
              <Button
                type="button"
                variant={filters.emailValidated === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, emailValidated: false })}
              >
                Невалидированы
              </Button>
            </div>
          </FilterGroup>
          <FilterGroup label="Теги (AND через запятую)">
            <Input
              placeholder="tariff:VR, track:music"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Все указанные теги должны быть у контакта.
            </p>
          </FilterGroup>
          <FilterGroup label="Ключевые слова (OR через запятую)">
            <Input
              placeholder="репетитор, школа, маркетинг"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Совпадение хотя бы по одному из полей User.keywords (накопленных с форм).
            </p>
          </FilterGroup>
        </FilterSection>

        {campaigns && campaigns.length > 0 && (
          <FilterSection title="Поведение в рассылках" icon={Mail}>
            <p className="text-xs text-gray-500 -mt-2">
              Retention-маркетинг: сегмент по тому, кто открыл / кликнул / проигнорировал
              предыдущие письма. Выбор кампаний ниже (показаны только запущенные).
            </p>
            <FilterGroup label="Открыл хотя бы одно из писем">
              <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                {campaigns.map((c) => (
                  <CheckboxRow
                    key={c.id}
                    label={c.name}
                    checked={filters.openedCampaignIds?.includes(c.id) ?? false}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        openedCampaignIds: toggle(filters.openedCampaignIds, c.id),
                      })
                    }
                  />
                ))}
              </div>
            </FilterGroup>
            <FilterGroup label="НЕ открыл ни одного из писем">
              <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                {campaigns.map((c) => (
                  <CheckboxRow
                    key={c.id}
                    label={c.name}
                    checked={filters.notOpenedCampaignIds?.includes(c.id) ?? false}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        notOpenedCampaignIds: toggle(filters.notOpenedCampaignIds, c.id),
                      })
                    }
                  />
                ))}
              </div>
            </FilterGroup>
            <FilterGroup label="Кликнул в этих кампаниях">
              <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                {campaigns.map((c) => (
                  <CheckboxRow
                    key={c.id}
                    label={c.name}
                    checked={filters.clickedCampaignIds?.includes(c.id) ?? false}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        clickedCampaignIds: toggle(filters.clickedCampaignIds, c.id),
                      })
                    }
                  />
                ))}
              </div>
            </FilterGroup>
            <FilterGroup label="НЕ кликнул в этих кампаниях">
              <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                {campaigns.map((c) => (
                  <CheckboxRow
                    key={c.id}
                    label={c.name}
                    checked={filters.notClickedCampaignIds?.includes(c.id) ?? false}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        notClickedCampaignIds: toggle(filters.notClickedCampaignIds, c.id),
                      })
                    }
                  />
                ))}
              </div>
            </FilterGroup>
          </FilterSection>
        )}

        <FilterSection title="Покупки" icon={ShoppingCart}>
          <FilterGroup label="Факт покупки">
            <div className="flex gap-1 flex-wrap">
              <Button
                type="button"
                variant={filters.purchasedAny === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, purchasedAny: undefined })}
              >
                Любой
              </Button>
              <Button
                type="button"
                variant={filters.purchasedAny === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, purchasedAny: true })}
              >
                Покупал
              </Button>
              <Button
                type="button"
                variant={filters.purchasedAny === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters({ ...filters, purchasedAny: false })}
              >
                Не покупал
              </Button>
            </div>
          </FilterGroup>
          {offers && offers.length > 0 && (
            <>
              <FilterGroup label="Купил один из offer'ов">
                <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                  {offers.map((o) => (
                    <CheckboxRow
                      key={o.id}
                      label={o.title}
                      checked={filters.purchasedOfferIds?.includes(o.id) ?? false}
                      onChange={() =>
                        setFilters({
                          ...filters,
                          purchasedOfferIds: toggle(filters.purchasedOfferIds, o.id),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup label="НЕ купил ни один из offer'ов">
                <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                  {offers.map((o) => (
                    <CheckboxRow
                      key={o.id}
                      label={o.title}
                      checked={filters.notPurchasedOfferIds?.includes(o.id) ?? false}
                      onChange={() =>
                        setFilters({
                          ...filters,
                          notPurchasedOfferIds: toggle(filters.notPurchasedOfferIds, o.id),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterGroup>
            </>
          )}
          <FilterGroup label="Только за последние N дней">
            <Input
              type="number"
              min={1}
              max={3650}
              placeholder="например 30"
              value={filters.purchasedSinceDaysAgo ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  purchasedSinceDaysAgo: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              Применяется ко всем фильтрам выше: «не покупал за последние 30 дней» = было давно либо никогда.
            </p>
          </FilterGroup>
        </FilterSection>

        <FilterSection title="Поиск по email/имени" icon={FilterIcon}>
          <Input
            placeholder="alex или @gmail"
            value={filters.search ?? ""}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
          />
        </FilterSection>

        <div className="flex justify-end pt-2">
          <Button size="lg" disabled={!name.trim() || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Сохраняем…" : submitLabel}
          </Button>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Превью сегмента
            </CardTitle>
            <CardDescription>
              Размер пересчитывается на лету. Sample — 10 контактов в порядке регистрации.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-gray-900">
              {preview?.count.toLocaleString("ru-RU") ?? "—"}
            </div>
            <p className="text-sm text-gray-500 mt-1">контактов попадает в сегмент</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(preview?.sample ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Нет контактов под текущие фильтры
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {(preview?.sample ?? []).map((u) => (
                  <div key={u.id} className="px-4 py-3 text-xs">
                    <div className="font-medium text-gray-900 truncate">{u.email}</div>
                    <div className="text-gray-500 truncate">
                      {u.fullName ?? "Без имени"} · {u.role}
                      {u.tariff ? ` · ${u.tariff}` : ""}
                    </div>
                    {u.marketingOptOut && (
                      <Badge variant="secondary" className="bg-red-50 text-red-700 mt-1 text-xs">
                        <X className="h-2 w-2 mr-1" />
                        Отписан
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function useFiltersWithDerived(
  filters: SegmentFiltersUI,
  tagsInput: string,
  keywordsInput: string
): SegmentFiltersUI {
  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const keywords = keywordsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    ...filters,
    tags: tags.length > 0 ? tags : undefined,
    keywordsAny: keywords.length > 0 ? keywords : undefined,
  };
}

function FilterSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-purple-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
