"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Plug, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FieldMapping {
  lmsVar: string;
  bitrixField: string;
}
interface TagTrigger {
  tag: string;
  stageId: string;
}
interface BitrixConfig {
  enabled: boolean;
  webhookUrl: string | null;
  funnelId: string;
  defaultStageId: string;
  contactMappings: FieldMapping[];
  dealMappings: FieldMapping[];
  tagTriggers: TagTrigger[];
}
interface BitrixFunnel {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; sort: number }>;
}
interface BitrixField {
  id: string;
  label: string;
  type: string;
}

// ─── LMS variable options ─────────────────────────────────────────────────────

const LMS_CONTACT_VARS = [
  { value: "client.phone", label: "Телефон" },
  { value: "client.email", label: "Email" },
  { value: "client.full_name", label: "Полное имя" },
  { value: "client.first_name", label: "Имя" },
  { value: "client.last_name", label: "Фамилия" },
  { value: "client.username", label: "Telegram username" },
  { value: "client.tg_id", label: "Telegram ID" },
];

const LMS_DEAL_VARS = [
  { value: "client.utm_source", label: "UTM source" },
  { value: "client.utm_medium", label: "UTM medium" },
  { value: "client.utm_campaign", label: "UTM campaign" },
  { value: "client.utm_content", label: "UTM content" },
  { value: "client.utm_term", label: "UTM term" },
  { value: "client.phone", label: "Телефон" },
  { value: "client.email", label: "Email" },
  { value: "client.full_name", label: "Полное имя" },
];

// ─── FieldMapper component ────────────────────────────────────────────────────

function FieldMapper({
  title,
  description,
  mappings,
  onChange,
  lmsOptions,
  bitrixFields,
  listId,
}: {
  title: string;
  description: string;
  mappings: FieldMapping[];
  onChange: (m: FieldMapping[]) => void;
  lmsOptions: Array<{ value: string; label: string }>;
  bitrixFields: BitrixField[];
  /** Уникальный id для <datalist> с подсказками переменных LMS. */
  listId: string;
}) {
  const add = () =>
    onChange([...mappings, { lmsVar: lmsOptions[0]?.value ?? "", bitrixField: "" }]);

  const remove = (i: number) =>
    onChange(mappings.filter((_, idx) => idx !== i));

  const update = (i: number, key: keyof FieldMapping, val: string) => {
    const next = mappings.map((m, idx) =>
      idx === i ? { ...m, [key]: val } : m
    );
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {mappings.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
            <span>Поле LMS</span>
            <span>Поле в Bitrix24</span>
            <span />
          </div>
          {/* Подсказки переменных LMS: пресеты + кастомные поля бота.
              Поле редактируемое — можно выбрать из списка или вписать
              любой путь вида custom.x / client.x / deal.x вручную. */}
          <datalist id={listId}>
            {lmsOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </datalist>
          {mappings.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input
                value={m.lmsVar}
                onChange={(e) => update(i, "lmsVar", e.target.value)}
                list={listId}
                placeholder="client.phone / custom.niche"
                className="h-8 text-xs font-mono"
              />

              <Select
                value={m.bitrixField}
                onValueChange={(v) => update(i, "bitrixField", v)}
                disabled={bitrixFields.length === 0}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue
                    placeholder={
                      bitrixFields.length === 0
                        ? "Сначала протестируй подключение"
                        : "Поле Bitrix24"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {bitrixFields.map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.label}
                      <span className="ml-1 text-muted-foreground opacity-60">
                        ({f.id})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={add} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" />
        Добавить маппинг
      </Button>
    </div>
  );
}

// ─── TagTriggerTable component ───────────────────────────────────────────────

function TagTriggerTable({
  triggers,
  onChange,
  allStages,
}: {
  triggers: TagTrigger[];
  onChange: (t: TagTrigger[]) => void;
  allStages: Array<{ id: string; name: string; funnelName: string }>;
}) {
  const add = () => onChange([...triggers, { tag: "", stageId: "" }]);
  const remove = (i: number) => onChange(triggers.filter((_, idx) => idx !== i));
  const update = (i: number, key: keyof TagTrigger, val: string) =>
    onChange(triggers.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)));

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">Тег-триггеры</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Когда подписчику добавляется тег — автоматически создаётся или
          обновляется сделка в Б24 с указанной стадией.
        </p>
      </div>

      {triggers.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
            <span>Тег</span>
            <span>Стадия в Bitrix24</span>
            <span />
          </div>
          {triggers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input
                value={t.tag}
                onChange={(e) => update(i, "tag", e.target.value)}
                placeholder="квалифицирован"
                className="h-8 text-xs"
              />
              <Select
                value={t.stageId}
                onValueChange={(v) => update(i, "stageId", v)}
                disabled={allStages.length === 0}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue
                    placeholder={
                      allStages.length === 0
                        ? "Протестируй подключение"
                        : "Стадия"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {allStages.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="text-muted-foreground mr-1">
                        {s.funnelName} /
                      </span>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={add} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" />
        Добавить триггер
      </Button>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function BotBitrixPage() {
  const { botId } = useParams<{ botId: string }>();
  const qc = useQueryClient();

  // Local form state
  const [form, setForm] = useState<BitrixConfig>({
    enabled: false,
    webhookUrl: null,
    funnelId: "0",
    defaultStageId: "",
    contactMappings: [],
    dealMappings: [],
    tagTriggers: [],
  });
  const [webhookInput, setWebhookInput] = useState("");
  const [funnels, setFunnels] = useState<BitrixFunnel[]>([]);
  const [dealFields, setDealFields] = useState<BitrixField[]>([]);
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  // Load saved config
  const { data: saved, isLoading } = useQuery<BitrixConfig>({
    queryKey: ["tg-bot-bitrix", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/bitrix`);
      return r.data;
    },
    enabled: !!botId,
  });

  useEffect(() => {
    if (saved) {
      setForm(saved);
      setWebhookInput(saved.webhookUrl ?? "");
    }
  }, [saved]);

  // Кастомные поля бота (вкладка «Поля») — подтягиваем как варианты
  // custom.<key> для маппинга. Именно сюда воронка пишет field.<key>.
  const { data: botCustomFields } = useQuery({
    queryKey: ["tg-bot-custom-fields", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/custom-fields`);
      return (r.data?.data?.fields ?? []) as Array<{
        key: string;
        label: string;
      }>;
    },
    enabled: !!botId,
  });

  const customFieldVars = (botCustomFields ?? []).map((f) => ({
    value: `custom.${f.key}`,
    label: `${f.label} (custom.${f.key})`,
  }));

  // All stages flat list (for tag trigger dropdown)
  const allStages = funnels.flatMap((f) =>
    f.stages.map((s) => ({ ...s, funnelName: f.name }))
  );

  // Test connection
  const handleTest = async () => {
    setTestStatus("loading");
    setTestError("");
    try {
      const r = await apiClient.post(`/admin/tg/bots/${botId}/bitrix`, {
        webhookUrl: webhookInput || null,
      });
      setFunnels(r.data.funnels ?? []);
      setDealFields(r.data.dealFields ?? []);
      setTestStatus("ok");
      toast.success(`Подключено. Найдено воронок: ${r.data.funnels?.length ?? 0}`);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ?? "Ошибка подключения к Bitrix24";
      setTestError(msg);
      setTestStatus("error");
      toast.error(msg);
    }
  };

  // Save config
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Отбрасываем недозаполненные строки, чтобы одна пустая строка
      // (например, выбрали LMS-поле, но не выбрали поле Bitrix) не роняла
      // весь сейв на серверной валидации («Неверный формат данных»).
      const cleanMappings = (arr: FieldMapping[]) =>
        arr.filter((m) => m.lmsVar.trim() && m.bitrixField.trim());
      const cleanTriggers = (arr: TagTrigger[]) =>
        arr.filter((t) => t.tag.trim() && t.stageId.trim());

      const droppedMappings =
        form.contactMappings.length +
        form.dealMappings.length -
        cleanMappings(form.contactMappings).length -
        cleanMappings(form.dealMappings).length;
      const droppedTriggers =
        form.tagTriggers.length - cleanTriggers(form.tagTriggers).length;

      await apiClient.put(`/admin/tg/bots/${botId}/bitrix`, {
        ...form,
        webhookUrl: webhookInput || null,
        contactMappings: cleanMappings(form.contactMappings),
        dealMappings: cleanMappings(form.dealMappings),
        tagTriggers: cleanTriggers(form.tagTriggers),
      });

      return { droppedMappings, droppedTriggers };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tg-bot-bitrix", botId] });
      const dropped =
        (res?.droppedMappings ?? 0) + (res?.droppedTriggers ?? 0);
      if (dropped > 0) {
        toast.success(
          `Настройки сохранены. Пропущено незаполненных строк: ${dropped}.`
        );
      } else {
        toast.success("Настройки сохранены");
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error ?? "Ошибка сохранения");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Plug className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Интеграция с Bitrix24</h2>
          <p className="text-sm text-muted-foreground">
            Автоматически создавай и обновляй сделки в Б24 при движении лида
            по воронке бота.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Включить интеграцию</p>
              <p className="text-sm text-muted-foreground">
                При выключенном состоянии все тег-триггеры и синхронизации
                игнорируются.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Webhook URL</CardTitle>
          <CardDescription>
            Найди в Б24: Настройки → Разработчикам → Входящие вебхуки.
            Если оставить пустым — используется глобальный{" "}
            <code className="text-xs bg-muted px-1 rounded">
              BITRIX24_WEBHOOK_URL
            </code>{" "}
            из .env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://your-domain.bitrix24.ru/rest/1/xxxxx/"
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testStatus === "loading"}
              className="shrink-0"
            >
              {testStatus === "loading" ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Проверить
            </Button>
          </div>

          {testStatus === "ok" && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Подключение успешно. Воронки и поля загружены.
            </div>
          )}
          {testStatus === "error" && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {testError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel + Default stage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Целевая воронка</CardTitle>
          <CardDescription>
            В какую воронку попадают сделки из этого бота. Сначала протестируй
            подключение — воронки загрузятся автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Воронка</Label>
              <Select
                value={form.funnelId}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, funnelId: v, defaultStageId: "" }));
                }}
                disabled={funnels.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      funnels.length === 0 ? "Сначала проверь подключение" : "Выбери воронку"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Стадия по умолчанию</Label>
              <Select
                value={form.defaultStageId || "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    defaultStageId: v === "__none__" ? "" : v,
                  }))
                }
                disabled={
                  !form.funnelId ||
                  !funnels.find((f) => f.id === form.funnelId)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Первая стадия (авто)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Первая стадия (авто)
                  </SelectItem>
                  {(
                    funnels.find((f) => f.id === form.funnelId)?.stages ?? []
                  ).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact field mappings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Маппинг контакта</CardTitle>
          <CardDescription>
            Какие данные подписчика писать в поля контакта Bitrix24. Контакт
            ищется по телефону или email, если не найден — создаётся.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldMapper
            title=""
            description=""
            listId="lms-contact-vars"
            mappings={form.contactMappings}
            onChange={(m) => setForm((f) => ({ ...f, contactMappings: m }))}
            lmsOptions={[...LMS_CONTACT_VARS, ...customFieldVars]}
            bitrixFields={dealFields.filter((f) =>
              ["string", "phone", "email", "crm"].includes(f.type)
            )}
          />
        </CardContent>
      </Card>

      {/* Deal field mappings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Маппинг сделки</CardTitle>
          <CardDescription>
            Какие LMS-переменные (UTM, ответы на вопросы бота и т.д.)
            попадают в поля сделки в Б24. UTM source/medium/campaign
            проставляются автоматически, если не переопределены здесь.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldMapper
            title=""
            description=""
            listId="lms-deal-vars"
            mappings={form.dealMappings}
            onChange={(m) => setForm((f) => ({ ...f, dealMappings: m }))}
            lmsOptions={[
              ...LMS_DEAL_VARS,
              // Кастомные поля бота (вкладка «Поля») — основной способ
              // прокинуть ответы воронки (field.<key>) в сделку.
              ...customFieldVars,
            ]}
            bitrixFields={dealFields}
          />
          <p className="text-xs text-muted-foreground">
            Ответы воронки, сохранённые как{" "}
            <code className="bg-muted px-1 rounded">field.x</code>, проставляй
            здесь как{" "}
            <code className="bg-muted px-1 rounded">custom.x</code> — они уже
            подставлены в подсказках. Поле редактируемое: можно вписать любой
            путь вручную ({" "}
            <code className="bg-muted px-1 rounded">custom.niche</code>,{" "}
            <code className="bg-muted px-1 rounded">client.email</code>).
          </p>
        </CardContent>
      </Card>

      {/* Tag triggers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Тег-триггеры → стадии Б24</CardTitle>
          <CardDescription>
            Когда бот добавляет подписчику тег — автоматически создаётся или
            обновляется сделка с нужной стадией. Не нужно вручную ставить
            http_request ноды в каждый флоу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagTriggerTable
            triggers={form.tagTriggers}
            onChange={(t) => setForm((f) => ({ ...f, tagTriggers: t }))}
            allStages={allStages}
          />

          {form.tagTriggers.length > 0 && (
            <div className="mt-4 rounded-md bg-blue-50 border border-blue-100 p-3">
              <p className="text-xs text-blue-800 font-medium mb-1">
                Как это работает
              </p>
              <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>Подписчик проходит флоу → add_tag «квалифицирован»</li>
                <li>
                  LMS автоматически ищет контакт в Б24 по телефону/email
                </li>
                <li>
                  Создаёт или обновляет сделку с нужной стадией и всеми
                  маппинг-полями
                </li>
                <li>МПЛ видит лид в Б24 без каких-либо ручных действий</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current config summary */}
      {form.tagTriggers.length > 0 && (
        <Card className="bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Активные тег-триггеры</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {form.tagTriggers
                .filter((t) => t.tag && t.stageId)
                .map((t, i) => {
                  const stage = allStages.find((s) => s.id === t.stageId);
                  return (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      <span className="font-medium">{t.tag}</span>
                      <span className="mx-1 opacity-50">→</span>
                      {stage ? `${stage.funnelName} / ${stage.name}` : t.stageId}
                    </Badge>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      <div className="flex justify-end gap-3 pb-8">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="min-w-32"
        >
          {saveMutation.isPending ? "Сохраняю..." : "Сохранить настройки"}
        </Button>
      </div>
    </div>
  );
}
