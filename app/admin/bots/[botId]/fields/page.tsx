"use client";

// Custom fields admin page. Per-bot schema for the TgSubscriber
// customFields JSON bag. Driver: flows save typed values via
// wait_reply.saveAs = "field.x", admin UI shows them in the lead card.

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, FormInput, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Field {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "email" | "phone" | "select" | "boolean" | "url";
  description: string | null;
  options: Array<{ value: string; label: string }>;
  validationRegex: string | null;
  isRequired: boolean;
  sortOrder: number;
}

const TYPE_LABELS: Record<Field["type"], string> = {
  text: "Текст",
  number: "Число",
  date: "Дата",
  email: "Email",
  phone: "Телефон",
  select: "Выбор из списка",
  boolean: "Да/Нет",
  url: "URL",
};

export default function FieldsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<Field>>({
    type: "text",
    isRequired: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tg-fields", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/custom-fields`);
      return r.data?.data?.fields as Field[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        key: draft.key,
        label: draft.label,
        type: draft.type,
        description: draft.description || undefined,
        isRequired: draft.isRequired,
        validationRegex: draft.validationRegex || undefined,
      };
      if (draft.type === "select") body.options = draft.options ?? [];
      return apiClient.post(`/admin/tg/bots/${botId}/custom-fields`, body);
    },
    onSuccess: () => {
      toast.success("Поле создано");
      setDraft({ type: "text", isRequired: false });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["tg-fields", botId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message ?? "Ошибка"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/tg/bots/${botId}/custom-fields/${id}`),
    onSuccess: () => {
      toast.success("Удалено");
      queryClient.invalidateQueries({ queryKey: ["tg-fields", botId] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FormInput className="h-5 w-5" /> Кастомные поля
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Типизированные дополнительные поля подписчика. Сохраняются из
              воронок через <code>wait_reply</code> → <code>field.&lt;key&gt;</code> с
              валидацией по типу.
            </p>
          </div>
          {!creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Создать
            </Button>
          )}
        </CardHeader>
        {creating && (
          <CardContent className="border-t pt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Ключ (для шаблонов)</Label>
                <Input
                  value={draft.key ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, key: e.target.value.toLowerCase() })
                  }
                  placeholder="email"
                  className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  В шаблонах: <code>{`{{field.${draft.key || "key"}}}`}</code> или{" "}
                  <code>{`{{client.${draft.key || "key"}}}`}</code>
                </p>
              </div>
              <div>
                <Label>Название</Label>
                <Input
                  value={draft.label ?? ""}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Email"
                />
              </div>
              <div>
                <Label>Тип</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => setDraft({ ...draft, type: v as Field["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as Field["type"][]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input
                  id="req"
                  type="checkbox"
                  checked={Boolean(draft.isRequired)}
                  onChange={(e) =>
                    setDraft({ ...draft, isRequired: e.target.checked })
                  }
                />
                <Label htmlFor="req" className="mb-0 font-normal">
                  Обязательное поле
                </Label>
              </div>
            </div>
            {draft.type === "select" && (
              <SelectOptionsEditor
                options={draft.options ?? []}
                onChange={(o) => setDraft({ ...draft, options: o })}
              />
            )}
            <div>
              <Label>Подсказка (опц.)</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Где это используется"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => create.mutate()}
                disabled={!draft.key || !draft.label || create.isPending}
              >
                Создать
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Отмена
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground">Загрузка…</div>}
      {!isLoading && data && data.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-6 text-center bg-zinc-50 rounded border">
          Пока ни одного поля. Типичный набор для воронок: email, phone, name.
        </div>
      )}

      <div className="space-y-2">
        {data?.map((f) => (
          <Card key={f.id}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.label}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {TYPE_LABELS[f.type]}
                  </Badge>
                  {f.isRequired && (
                    <Badge variant="destructive" className="text-[10px]">
                      обяз.
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  field.{f.key}
                </div>
                {f.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {f.description}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (
                    confirm(
                      `Удалить поле «${f.label}»? Значения в карточках подписчиков останутся в БД.`,
                    )
                  ) {
                    remove.mutate(f.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && data.length > 0 && (
        <div className="text-xs text-muted-foreground flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            При сохранении из <code>wait_reply</code> с префиксом{" "}
            <code>field.&lt;key&gt;</code> значение проходит валидацию по типу.
            Невалидные ответы триггерят ветку «onInvalid», если она задана.
          </span>
        </div>
      )}
    </div>
  );
}

function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  onChange: (next: Array<{ value: string; label: string }>) => void;
}) {
  return (
    <div className="border rounded p-3 space-y-2 bg-zinc-50/50">
      <Label className="text-xs">Варианты</Label>
      {options.map((opt, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            value={opt.value}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...opt, value: e.target.value };
              onChange(next);
            }}
            placeholder="value"
            className="flex-1 font-mono text-xs"
          />
          <Input
            value={opt.label}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...opt, label: e.target.value };
              onChange(next);
            }}
            placeholder="Подпись"
            className="flex-1 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(options.filter((_, i) => i !== idx))}
          >
            <Trash2 className="h-3 w-3 text-red-500" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...options, { value: "", label: "" }])}
      >
        <Plus className="mr-1 h-3 w-3" /> вариант
      </Button>
    </div>
  );
}
