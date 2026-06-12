"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, X, FlaskConical, Plus } from "lucide-react";

// Telegram-типы медиа. Каждое требует свой sendXxx-метод; в album
// (2+ файла) можно класть только photo + video, остальные шлются по
// одному (sender это уже умеет).
const MEDIA_KINDS = [
  { value: "photo", label: "Фото" },
  { value: "video", label: "Видео" },
  { value: "animation", label: "GIF / Анимация" },
  { value: "document", label: "Документ / файл" },
  { value: "audio", label: "Аудио" },
  { value: "voice", label: "Голосовое" },
  { value: "video_note", label: "Видеосообщение (кружок)" },
] as const;

type MediaKind = (typeof MEDIA_KINDS)[number]["value"];
interface MediaItem {
  kind: MediaKind;
  url: string;
}

export default function NewBroadcastPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const router = useRouter();

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<MediaItem[]>([]);
  const [buttonsText, setButtonsText] = useState(""); // one per line: label|url
  const [tagsAny, setTagsAny] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [newExclude, setNewExclude] = useState("");
  const [slugsAny, setSlugsAny] = useState<string[]>([]);
  const [newSlug, setNewSlug] = useState("");
  const [excludeSlugs, setExcludeSlugs] = useState<string[]>([]);
  const [newExcludeSlug, setNewExcludeSlug] = useState("");
  // Диапазоны дат сегментации. YYYY-MM-DD из <input type="date">.
  const [subscribedFrom, setSubscribedFrom] = useState("");
  const [subscribedTo, setSubscribedTo] = useState("");
  const [lastSeenFrom, setLastSeenFrom] = useState("");
  const [lastSeenTo, setLastSeenTo] = useState("");
  const [startNow, setStartNow] = useState(false);
  const [testRecipients, setTestRecipients] = useState("");

  // Подсказки по UTM-slug'ам — берём из трекинг-ссылок бота.
  const { data: slugSuggestions } = useQuery({
    queryKey: ["tg-tracking-links-slugs", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/tracking-links`);
      const links = (r.data?.data?.links ?? []) as Array<{ slug: string; name: string }>;
      return links.map((l) => ({ slug: l.slug, name: l.name }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const buttonRows = buttonsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [label, url] = l.split("|").map((s) => s.trim());
          return [{ text: label, url }];
        });

      const cleanAttachments = attachments
        .map((a) => ({ kind: a.kind, url: a.url.trim() }))
        .filter((a) => a.url.length > 0);

      const payload: any = {
        name,
        message: {
          text,
          attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
          buttonRows: buttonRows.length > 0 ? buttonRows : undefined,
        },
        filter: {
          tagsAny: tagsAny.length > 0 ? tagsAny : undefined,
          excludeTags: excludeTags.length > 0 ? excludeTags : undefined,
          slugsAny: slugsAny.length > 0 ? slugsAny : undefined,
          excludeSlugs: excludeSlugs.length > 0 ? excludeSlugs : undefined,
          // from = 00:00 локального дня, to = 23:59:59.999, чтобы границы
          // совпадали с интуитивным «весь день включительно».
          subscribedFrom: subscribedFrom
            ? new Date(`${subscribedFrom}T00:00:00`).toISOString()
            : undefined,
          subscribedTo: subscribedTo
            ? new Date(`${subscribedTo}T23:59:59.999`).toISOString()
            : undefined,
          lastSeenFrom: lastSeenFrom
            ? new Date(`${lastSeenFrom}T00:00:00`).toISOString()
            : undefined,
          lastSeenTo: lastSeenTo
            ? new Date(`${lastSeenTo}T23:59:59.999`).toISOString()
            : undefined,
          allActive: true,
        },
        startNow,
      };
      const r = await apiClient.post(`/admin/tg/bots/${botId}/broadcasts`, payload);
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success(startNow ? "Рассылка запущена" : "Черновик сохранён");
      router.push(`/admin/bots/${botId}/broadcasts`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  const testSend = useMutation({
    mutationFn: async () => {
      const recipients = testRecipients
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (recipients.length === 0) {
        throw new Error("Укажите хотя бы один chat_id или subscriber-id");
      }
      const buttonRows = buttonsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [label, url] = l.split("|").map((s) => s.trim());
          return [{ text: label, url }];
        });
      const cleanAttachments = attachments
        .map((a) => ({ kind: a.kind, url: a.url.trim() }))
        .filter((a) => a.url.length > 0);
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/broadcasts/test-send`,
        {
          message: {
            text,
            attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
            buttonRows: buttonRows.length > 0 ? buttonRows : undefined,
          },
          recipients,
        }
      );
      return r.data?.data as {
        sent: number;
        total: number;
        missing: string[];
        results: Array<{ chatId: string; ok: boolean; error?: string }>;
      };
    },
    onSuccess: (data) => {
      const failed = data.results.filter((r) => !r.ok).length;
      const missing = data.missing.length;
      if (data.sent > 0 && failed === 0 && missing === 0) {
        toast.success(`Отправлено ${data.sent} получателям`);
      } else {
        toast(
          `Отправлено ${data.sent}/${data.total}. Не доставлено: ${failed}. Не найдено: ${missing}.`,
          { duration: 6000 }
        );
      }
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.error?.message ?? e?.message ?? "Ошибка тестовой отправки"
      ),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сообщение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Название (для админки)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Запуск 15 мая"
            />
          </div>
          <div>
            <Label>Текст (HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;)</Label>
            <Textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Привет, {{user.first_name}}! ..."
            />
          </div>
          <div>
            <Label>Медиа-вложения (опционально)</Label>
            <div className="mt-1 space-y-2">
              {attachments.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={a.kind}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[i] = { ...next[i], kind: e.target.value as MediaKind };
                      setAttachments(next);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {MEDIA_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={a.url}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[i] = { ...next[i], url: e.target.value };
                      setAttachments(next);
                    }}
                    placeholder="https://… (прямая ссылка на файл)"
                    className="flex-1 min-w-[260px]"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAttachments(attachments.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {attachments.length < 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setAttachments([...attachments, { kind: "photo", url: "" }])
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Добавить медиа
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Поддерживаются прямые URL на файл (https://…). 2–10 фото/видео
              склеятся в альбом; остальные типы шлются по одному. Подпись
              (caption) Telegram возьмёт из поля «Текст» выше — первая
              картинка её получит.
            </p>
          </div>
          <div>
            <Label>Кнопки (по одной в строке: «Текст | https://...»)</Label>
            <Textarea
              rows={3}
              value={buttonsText}
              onChange={(e) => setButtonsText(e.target.value)}
              placeholder={"Зарегистрироваться | https://example.com\nКаталог | https://example.com/catalog"}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Получатели</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TagEditor
            label="Включить с тегами (любой из):"
            tags={tagsAny}
            setTags={setTagsAny}
            input={newTag}
            setInput={setNewTag}
          />
          <TagEditor
            label="Исключить с тегами (любой из):"
            tags={excludeTags}
            setTags={setExcludeTags}
            input={newExclude}
            setInput={setNewExclude}
          />
          <TagEditor
            label="Включить по UTM-ссылке (slug — first/last touch):"
            tags={slugsAny}
            setTags={setSlugsAny}
            input={newSlug}
            setInput={setNewSlug}
            placeholder="slug трекинг-ссылки"
            datalistId="utm-slug-suggestions"
            suggestions={slugSuggestions}
          />
          <TagEditor
            label="Исключить по UTM-ссылке (slug):"
            tags={excludeSlugs}
            setTags={setExcludeSlugs}
            input={newExcludeSlug}
            setInput={setNewExcludeSlug}
            placeholder="slug трекинг-ссылки"
            datalistId="utm-slug-suggestions"
            suggestions={slugSuggestions}
          />
          <DateRangeFilter
            label="Подписался (нажал /start) в диапазоне:"
            from={subscribedFrom}
            to={subscribedTo}
            setFrom={setSubscribedFrom}
            setTo={setSubscribedTo}
          />
          <DateRangeFilter
            label="Последняя активность в диапазоне:"
            from={lastSeenFrom}
            to={lastSeenTo}
            setFrom={setLastSeenFrom}
            setTo={setLastSeenTo}
          />
          <p className="text-xs text-muted-foreground">
            UTM-сегмент матчит подписчиков, у которых slug совпадает с first_touch_slug
            или last_touch_slug. Если все списки пустые — рассылка отправится всем активным
            (не заблокировавшим бота) подписчикам.
          </p>
          <label className="flex items-center gap-2 text-sm pt-2">
            <input
              type="checkbox"
              checked={startNow}
              onChange={(e) => setStartNow(e.target.checked)}
            />
            Запустить сразу (иначе сохраним как черновик).
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Тестовая отправка
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              до 5 получателей, не влияет на статистику основной рассылки
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>chat_id или subscriber-id через пробел/запятую</Label>
            <Input
              value={testRecipients}
              onChange={(e) => setTestRecipients(e.target.value)}
              placeholder="123456789, 987654321"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              chat_id видно в карточке подписчика. Подставьте 1-2 своих
              тестовых аккаунта.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testSend.mutate()}
            disabled={
              !text.trim() || !testRecipients.trim() || testSend.isPending
            }
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            {testSend.isPending ? "Отправляю…" : "Отправить тест"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
        <Button onClick={() => create.mutate()} disabled={!name.trim() || !text.trim() || create.isPending}>
          <Send className="mr-2 h-4 w-4" />
          {startNow ? "Создать и запустить" : "Сохранить черновик"}
        </Button>
      </div>
    </div>
  );
}

function DateRangeFilter(props: {
  label: string;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div>
      <Label>{props.label}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={props.from}
          onChange={(e) => props.setFrom(e.target.value)}
          className="w-44"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <Input
          type="date"
          value={props.to}
          onChange={(e) => props.setTo(e.target.value)}
          className="w-44"
        />
        {(props.from || props.to) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              props.setFrom("");
              props.setTo("");
            }}
          >
            сброс
          </Button>
        )}
      </div>
    </div>
  );
}

function TagEditor(props: {
  label: string;
  tags: string[];
  setTags: (t: string[]) => void;
  input: string;
  setInput: (v: string) => void;
  placeholder?: string;
  /** Если задан — у инпута появляется <datalist> с подсказками. */
  datalistId?: string;
  suggestions?: Array<{ slug: string; name: string }>;
}) {
  return (
    <div>
      <Label>{props.label}</Label>
      <div className="mt-1 flex flex-wrap gap-1">
        {props.tags.map((t) => (
          <Badge key={t} variant="secondary" className="flex items-center gap-1">
            {t}
            <button onClick={() => props.setTags(props.tags.filter((x) => x !== t))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={props.input}
          onChange={(e) => props.setInput(e.target.value)}
          placeholder={props.placeholder ?? "тег"}
          list={props.datalistId}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const t = props.input.trim();
            if (t && !props.tags.includes(t)) props.setTags([...props.tags, t]);
            props.setInput("");
          }}
        >
          добавить
        </Button>
      </div>
      {props.datalistId && props.suggestions && props.suggestions.length > 0 && (
        <datalist id={props.datalistId}>
          {props.suggestions.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </datalist>
      )}
    </div>
  );
}
