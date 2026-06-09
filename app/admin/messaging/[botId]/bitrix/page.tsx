"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Save } from "lucide-react";

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

const CLIENT_VAR_SUGGESTIONS = [
  "client.phone",
  "client.email",
  "client.first_name",
  "client.last_name",
  "client.full_name",
  "client.username",
  "client.external_id",
  "client.utm_source",
  "client.utm_medium",
  "client.utm_campaign",
];

export default function BitrixConfigPage() {
  const { botId } = useParams<{ botId: string }>();
  const [config, setConfig] = useState<BitrixConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    fetch(`/api/admin/messaging/bots/${botId}/bitrix`)
      .then((r) => r.json())
      .then((d) => setConfig(d.data))
      .finally(() => setLoading(false));
  }, [botId]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/messaging/bots/${botId}/bitrix`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await res.json();
      if (d.success) {
        setSavedAt(new Date());
      } else {
        alert(d.error ?? "Ошибка");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return <div className="p-6 text-gray-400 text-sm">Загрузка…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto"><div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bitrix24</h1>
          <p className="text-sm text-gray-500 mt-0.5">Синхронизация подписчиков</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-1 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {savedAt && (
        <div className="mb-4 text-xs text-green-600">
          ✓ Сохранено в {savedAt.toLocaleTimeString("ru-RU")}
        </div>
      )}

      <div className="space-y-4">
        {/* Enabled */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Синхронизация активна</div>
              <div className="text-xs text-gray-500">
                Когда выключено — все вызовы синхронизации no-op.
              </div>
            </div>
          </label>
        </div>

        {/* Webhook + funnel */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Подключение</h2>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bitrix24 webhook URL</label>
            <input
              type="text"
              value={config.webhookUrl ?? ""}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value || null })}
              placeholder="https://your-domain.bitrix24.ru/rest/1/xxxxx/"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Пусто = использовать env BITRIX24_WEBHOOK_URL</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ID воронки</label>
              <input
                type="text"
                value={config.funnelId}
                onChange={(e) => setConfig({ ...config, funnelId: e.target.value })}
                placeholder="0 = общая"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Стадия по умолчанию</label>
              <input
                type="text"
                value={config.defaultStageId}
                onChange={(e) => setConfig({ ...config, defaultStageId: e.target.value })}
                placeholder="NEW или C14:NEW"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Contact mappings */}
        <MappingSection
          title="Маппинг контакта"
          description="Какие поля подписчика → в какие поля контакта Bitrix24"
          mappings={config.contactMappings}
          onChange={(m) => setConfig({ ...config, contactMappings: m })}
        />

        {/* Deal mappings */}
        <MappingSection
          title="Маппинг сделки"
          description="UTM-метки и кастомные поля автоматически попадают в сделку"
          mappings={config.dealMappings}
          onChange={(m) => setConfig({ ...config, dealMappings: m })}
        />

        {/* Tag triggers */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Триггеры по тегам</h2>
              <p className="text-xs text-gray-500">
                Когда подписчик получает указанный тег — автоматически синкается в эту стадию
              </p>
            </div>
            <button
              onClick={() =>
                setConfig({
                  ...config,
                  tagTriggers: [...config.tagTriggers, { tag: "", stageId: "" }],
                })
              }
              className="text-sm px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Добавить
            </button>
          </div>
          {config.tagTriggers.length === 0 ? (
            <div className="text-xs text-gray-400">Нет триггеров</div>
          ) : (
            <div className="space-y-2">
              {config.tagTriggers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={t.tag}
                    onChange={(e) => {
                      const next = [...config.tagTriggers];
                      next[i] = { ...t, tag: e.target.value };
                      setConfig({ ...config, tagTriggers: next });
                    }}
                    placeholder="тег"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-gray-300">→</span>
                  <input
                    type="text"
                    value={t.stageId}
                    onChange={(e) => {
                      const next = [...config.tagTriggers];
                      next[i] = { ...t, stageId: e.target.value };
                      setConfig({ ...config, tagTriggers: next });
                    }}
                    placeholder="STAGE_ID"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={() =>
                      setConfig({
                        ...config,
                        tagTriggers: config.tagTriggers.filter((_, j) => j !== i),
                      })
                    }
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MappingSection({
  title,
  description,
  mappings,
  onChange,
}: {
  title: string;
  description: string;
  mappings: FieldMapping[];
  onChange: (m: FieldMapping[]) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <button
          onClick={() => onChange([...mappings, { lmsVar: "", bitrixField: "" }])}
          className="text-sm px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Добавить
        </button>
      </div>
      {mappings.length === 0 ? (
        <div className="text-xs text-gray-400">Нет полей</div>
      ) : (
        <div className="space-y-2">
          {mappings.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                list={`var-suggestions-${i}`}
                value={m.lmsVar}
                onChange={(e) => {
                  const next = [...mappings];
                  next[i] = { ...m, lmsVar: e.target.value };
                  onChange(next);
                }}
                placeholder="client.phone"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <datalist id={`var-suggestions-${i}`}>
                {CLIENT_VAR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <span className="text-gray-300">→</span>
              <input
                type="text"
                value={m.bitrixField}
                onChange={(e) => {
                  const next = [...mappings];
                  next[i] = { ...m, bitrixField: e.target.value };
                  onChange(next);
                }}
                placeholder="PHONE / UF_CRM_..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={() => onChange(mappings.filter((_, j) => j !== i))}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
