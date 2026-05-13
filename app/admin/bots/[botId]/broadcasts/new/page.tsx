"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, X } from "lucide-react";

export default function NewBroadcastPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const router = useRouter();

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [buttonsText, setButtonsText] = useState(""); // one per line: label|url
  const [tagsAny, setTagsAny] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [newExclude, setNewExclude] = useState("");
  const [startNow, setStartNow] = useState(false);

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

      const payload: any = {
        name,
        message: {
          text,
          photoUrl: photoUrl || undefined,
          buttonRows: buttonRows.length > 0 ? buttonRows : undefined,
        },
        filter: {
          tagsAny: tagsAny.length > 0 ? tagsAny : undefined,
          excludeTags: excludeTags.length > 0 ? excludeTags : undefined,
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
            <Label>Картинка (URL, опционально)</Label>
            <Input
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://..."
            />
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
          <p className="text-xs text-muted-foreground">
            Если оба списка пустые — рассылка отправится всем активным (не заблокировавшим бота) подписчикам.
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

function TagEditor(props: {
  label: string;
  tags: string[];
  setTags: (t: string[]) => void;
  input: string;
  setInput: (v: string) => void;
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
          placeholder="тег"
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
    </div>
  );
}
