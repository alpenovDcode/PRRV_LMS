"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Settings,
  CheckCircle2,
  Copy,
  AlertTriangle,
  Server,
  Globe,
  Mail,
  Webhook,
  ShieldCheck,
} from "lucide-react";

interface SettingsData {
  provider: "yandex" | "unisender";
  fromName: string;
  fromEmail: string | null;
  trackingBaseUrl: string;
  webhookUrl: string;
  trackingPixelExample: string;
  unsubscribeExample: string;
  configStatus: {
    cronSecret: boolean;
    unisenderApiKey: boolean;
    unisenderWebhookSecret: boolean;
    unisenderDefaultListId: boolean;
    smtpUser: boolean;
    smtpPassword: boolean;
  };
  dnsExample: {
    spf: string;
    dkim: string;
    dmarc: string;
  };
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} скопирован в буфер`);
}

export default function MarketingSettingsPage() {
  const { data } = useQuery<SettingsData>({
    queryKey: ["marketing-settings"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/settings");
      return r.data.data;
    },
  });

  if (!data) {
    return <div className="container mx-auto max-w-5xl px-4 py-8 text-gray-500">Загрузка…</div>;
  }

  const isUnisender = data.provider === "unisender";
  const isFullyConfigured = isUnisender
    ? data.configStatus.unisenderApiKey &&
      data.configStatus.unisenderWebhookSecret &&
      data.configStatus.cronSecret
    : data.configStatus.smtpUser && data.configStatus.smtpPassword && data.configStatus.cronSecret;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
          <Settings className="h-6 w-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Настройки</h1>
          <p className="text-gray-600">
            Текущее состояние конфигурации и инструкции по подключению Unisender.
          </p>
        </div>
      </div>

      {/* Текущий провайдер */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-emerald-600" />
            Текущий провайдер доставки
          </CardTitle>
          <CardDescription>
            Меняется через env <code className="rounded bg-gray-100 px-1">EMAIL_MARKETING_PROVIDER</code> +
            рестарт. Переход безболезненный — UI и БД не меняются.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge
              className={
                isUnisender
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-base px-3 py-1"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-50 text-base px-3 py-1"
              }
            >
              {isUnisender ? "Unisender" : "Yandex SMTP (временный)"}
            </Badge>
            {isFullyConfigured ? (
              <span className="text-sm text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> готов к рассылкам
              </span>
            ) : (
              <span className="text-sm text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> не все секреты прописаны
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="От (имя)" value={data.fromName} />
            <Field label="От (email)" value={data.fromEmail ?? "— не задан"} />
          </div>
          {!isUnisender && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
              <strong>Yandex SMTP</strong> подходит для тестов на сотрудниках и узких сегментах.
              Не отправляйте на 70K-базу до подключения Unisender — Yandex быстро забанит за объём.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Чек-лист переключения */}
      <Card>
        <CardHeader>
          <CardTitle>Что нужно сделать чтобы подключить Unisender</CardTitle>
          <CardDescription>
            Шаги Евгения после возвращения из отпуска. Платформа уже готова — только подмена env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Step
            n={1}
            title="Заключить договор с Unisender, выбрать тариф Standard 75K (~26K/мес или 218K/год)."
            done={false}
          />
          <Step
            n={2}
            title="Заказать услугу «Аутентификация домена» (10K ₽) — Unisender пришлёт SPF/DKIM/DMARC."
            done={false}
          />
          <Step n={3} title="Внести DNS-записи (см. ниже примеры)." done={false} />
          <Step
            n={4}
            title="Заказать прогрев домена (20–50K ₽) — 2–8 недель итеративной отправки."
            done={false}
          />
          <Step
            n={5}
            title="Получить API-ключ и webhook-секрет в кабинете Unisender."
            done={false}
          />
          <Step
            n={6}
            title="Прописать в .env: UNISENDER_API_KEY, UNISENDER_WEBHOOK_SECRET, UNISENDER_DEFAULT_LIST_ID."
            done={data.configStatus.unisenderApiKey && data.configStatus.unisenderWebhookSecret}
          />
          <Step
            n={7}
            title="Сменить EMAIL_MARKETING_PROVIDER=unisender в .env, перезапустить app."
            done={isUnisender}
          />
          <Step
            n={8}
            title="Указать webhook URL в кабинете Unisender (см. ниже — копируется одним кликом)."
            done={false}
          />
          <Step
            n={9}
            title="Запустить первую тестовую кампанию на узкий сегмент (5–10 сотрудников)."
            done={false}
          />
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-purple-600" />
            Webhook URL для Unisender
          </CardTitle>
          <CardDescription>
            Скопируйте и вставьте в кабинете Unisender (раздел Настройки → Webhooks).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <CopyRow label="Webhook URL" value={data.webhookUrl} />
          <p className="text-xs text-gray-500">
            HMAC-подпись проверяется автоматически на стороне платформы через
            <code className="rounded bg-gray-100 px-1 mx-1">UNISENDER_WEBHOOK_SECRET</code>.
            Поддерживаются события: delivered / opened / clicked / bounced / spam / unsubscribed.
            Hard-bounce и spam автоматически добавляют пользователя в suppression list.
          </p>
        </CardContent>
      </Card>

      {/* DNS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            DNS-записи для маркетингового домена
          </CardTitle>
          <CardDescription>
            Точные значения возьмёте у Unisender после заказа аутентификации. Это шаблон.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <RecordRow type="TXT" name="@" value={data.dnsExample.spf} purpose="SPF" />
          <RecordRow
            type="TXT"
            name="us._domainkey"
            value={data.dnsExample.dkim}
            purpose="DKIM"
          />
          <RecordRow
            type="TXT"
            name="_dmarc"
            value={data.dnsExample.dmarc}
            purpose="DMARC"
          />
        </CardContent>
      </Card>

      {/* Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Tracking endpoints
          </CardTitle>
          <CardDescription>
            URL&apos;ы которые автоматически вставляются в каждое маркетинговое письмо.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <CopyRow label="Tracking pixel" value={data.trackingPixelExample} />
          <CopyRow label="Unsubscribe" value={data.unsubscribeExample} />
          <CopyRow label="Click redirect" value={`${data.trackingBaseUrl}/api/email/track/click/<recipientId>?url=...`} />
          <p className="text-xs text-gray-500 pt-2 border-t">
            Все три эндпоинта в whitelist middleware — публичны без авторизации.
            IP получателя пишется как sha256-хеш (privacy).
          </p>
        </CardContent>
      </Card>

      {/* Cron */}
      <Card>
        <CardHeader>
          <CardTitle>Cron-обработчик</CardTitle>
          <CardDescription>
            Sidecar email-cron дёргает endpoint каждые 10 секунд — обрабатывает очередь рассылок
            и автоматизации.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <CopyRow label="Tick URL" value={`${data.trackingBaseUrl}/api/email-cron/tick`} />
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-gray-400" />
            <span className="text-gray-700">EMAIL_CRON_SECRET</span>
            {data.configStatus.cronSecret ? (
              <Badge className="bg-emerald-50 text-emerald-700">задан</Badge>
            ) : (
              <Badge className="bg-red-50 text-red-700">НЕ задан</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500">
            В docker-compose.prod.yml уже добавлен sidecar <code>email-cron</code>. На локалке —
            curl вручную или через <code>npm run dev</code> запустится без sidecar (просто очередь
            будет стоять).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}

function Step({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{n}</span>}
      </div>
      <span className={done ? "text-gray-500 line-through" : "text-gray-800"}>{title}</span>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 group">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <code className="text-sm text-gray-900 truncate block">{value}</code>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => copy(value, label)}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function RecordRow({
  type,
  name,
  value,
  purpose,
}: {
  type: string;
  name: string;
  value: string;
  purpose: string;
}) {
  return (
    <div className="grid grid-cols-[60px,1fr,60px] gap-3 items-start text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0">
      <div>
        <Badge variant="outline" className="text-xs">
          {type}
        </Badge>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">name: <code>{name}</code></div>
        <code className="text-xs text-gray-800 break-all">{value}</code>
      </div>
      <Badge variant="secondary" className="text-xs">
        {purpose}
      </Badge>
    </div>
  );
}

