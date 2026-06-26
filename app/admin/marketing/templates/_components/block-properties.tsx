"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type {
  BlockAlignment,
  ButtonBlock,
  DividerBlock,
  EmailBlock,
  EmailDocument,
  FooterBlock,
  HeadingBlock,
  ImageBlock,
  SpacerBlock,
  TextBlock,
} from "@/lib/email/editor/types";

interface BlockPropertiesProps {
  block: EmailBlock | null;
  document: EmailDocument;
  onChange: (block: EmailBlock) => void;
  onSettingsChange: (settings: EmailDocument["settings"]) => void;
}

/**
 * Панель свойств справа. Когда блок выбран — редактируем его атрибуты.
 * Когда не выбран — глобальные настройки документа (фон, шрифт, ширина).
 */
export function BlockProperties({
  block,
  document,
  onChange,
  onSettingsChange,
}: BlockPropertiesProps) {
  if (!block) {
    return <SettingsForm settings={document.settings} onChange={onSettingsChange} />;
  }

  switch (block.type) {
    case "heading":
      return <HeadingForm block={block} onChange={onChange} />;
    case "text":
      return <TextForm block={block} onChange={onChange} />;
    case "button":
      return <ButtonForm block={block} onChange={onChange} />;
    case "image":
      return <ImageForm block={block} onChange={onChange} />;
    case "divider":
      return <DividerForm block={block} onChange={onChange} />;
    case "spacer":
      return <SpacerForm block={block} onChange={onChange} />;
    case "footer":
      return <FooterForm block={block} onChange={onChange} />;
    case "columns":
      return (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">
            Свойства колонок — в Спринте 4.
          </CardContent>
        </Card>
      );
    default: {
      const exhaustive: never = block;
      return <div>Unknown block type: {(exhaustive as EmailBlock).type}</div>;
    }
  }
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</div>
        {children}
      </CardContent>
    </Card>
  );
}

function AlignmentPicker({
  value,
  onChange,
}: {
  value: BlockAlignment | undefined;
  onChange: (v: BlockAlignment) => void;
}) {
  return (
    <div className="flex gap-1">
      {(["left", "center", "right"] as const).map((a) => {
        const Icon = a === "left" ? AlignLeft : a === "right" ? AlignRight : AlignCenter;
        return (
          <Button
            key={a}
            type="button"
            variant={value === a ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => onChange(a)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  fallback,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  fallback: string;
}) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="color"
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 rounded border border-gray-200 cursor-pointer"
      />
      <Input value={value ?? ""} placeholder={fallback} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SettingsForm({
  settings,
  onChange,
}: {
  settings: EmailDocument["settings"];
  onChange: (s: EmailDocument["settings"]) => void;
}) {
  return (
    <FormCard title="Настройки письма">
      <div>
        <Label className="text-xs text-gray-600">Цвет фона</Label>
        <ColorInput
          value={settings.backgroundColor}
          fallback="#f3f4f6"
          onChange={(v) => onChange({ ...settings, backgroundColor: v })}
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Цвет ссылок</Label>
        <ColorInput
          value={settings.linkColor}
          fallback="#2563eb"
          onChange={(v) => onChange({ ...settings, linkColor: v })}
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Ширина (px)</Label>
        <Input
          type="number"
          min={320}
          max={800}
          value={settings.contentWidth}
          onChange={(e) => onChange({ ...settings, contentWidth: Number(e.target.value) || 600 })}
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Шрифт</Label>
        <Input
          value={settings.fontFamily}
          onChange={(e) => onChange({ ...settings, fontFamily: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">
          Web-safe для писем: Helvetica, Arial, Georgia, &apos;Times New Roman&apos;.
        </p>
      </div>
    </FormCard>
  );
}

function HeadingForm({ block, onChange }: { block: HeadingBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Заголовок">
      <div>
        <Label className="text-xs text-gray-600">Текст</Label>
        <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Уровень</Label>
        <div className="flex gap-1 mt-1">
          {([1, 2, 3] as const).map((l) => (
            <Button
              key={l}
              type="button"
              variant={block.level === l ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => onChange({ ...block, level: l })}
            >
              H{l}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-600">Выравнивание</Label>
        <AlignmentPicker value={block.align} onChange={(v) => onChange({ ...block, align: v })} />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Цвет</Label>
        <ColorInput
          value={block.color}
          fallback="#1f2937"
          onChange={(v) => onChange({ ...block, color: v })}
        />
      </div>
    </FormCard>
  );
}

function TextForm({ block, onChange }: { block: TextBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Текст">
      <div>
        <Label className="text-xs text-gray-600">HTML (поддерживает &lt;b&gt;, &lt;i&gt;, &lt;a&gt;, &lt;ul&gt;, &lt;p&gt;)</Label>
        <Textarea
          rows={8}
          value={block.html}
          onChange={(e) => onChange({ ...block, html: e.target.value })}
          className="font-mono text-xs"
        />
        <p className="text-xs text-gray-400 mt-1">
          Переменные: <code>{`{{firstName}}`}</code>, <code>{`{{email}}`}</code>.
        </p>
      </div>
      <div>
        <Label className="text-xs text-gray-600">Выравнивание</Label>
        <AlignmentPicker value={block.align} onChange={(v) => onChange({ ...block, align: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-gray-600">Размер (px)</Label>
          <Input
            type="number"
            min={10}
            max={32}
            value={block.fontSize ?? 16}
            onChange={(e) => onChange({ ...block, fontSize: Number(e.target.value) || 16 })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Цвет</Label>
          <ColorInput
            value={block.color}
            fallback="#374151"
            onChange={(v) => onChange({ ...block, color: v })}
          />
        </div>
      </div>
    </FormCard>
  );
}

function ButtonForm({ block, onChange }: { block: ButtonBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Кнопка">
      <div>
        <Label className="text-xs text-gray-600">Текст</Label>
        <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-gray-600">URL</Label>
        <Input
          type="url"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="https://prrv.tech/…"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Выравнивание</Label>
        <AlignmentPicker value={block.align} onChange={(v) => onChange({ ...block, align: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-gray-600">Фон</Label>
          <ColorInput
            value={block.backgroundColor}
            fallback="#2563eb"
            onChange={(v) => onChange({ ...block, backgroundColor: v })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Текст</Label>
          <ColorInput
            value={block.textColor}
            fallback="#ffffff"
            onChange={(v) => onChange({ ...block, textColor: v })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-gray-600">Pad Y</Label>
          <Input
            type="number"
            min={4}
            max={40}
            value={block.paddingY ?? 14}
            onChange={(e) => onChange({ ...block, paddingY: Number(e.target.value) || 14 })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Pad X</Label>
          <Input
            type="number"
            min={8}
            max={80}
            value={block.paddingX ?? 28}
            onChange={(e) => onChange({ ...block, paddingX: Number(e.target.value) || 28 })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Радиус</Label>
          <Input
            type="number"
            min={0}
            max={40}
            value={block.borderRadius ?? 8}
            onChange={(e) => onChange({ ...block, borderRadius: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    </FormCard>
  );
}

function ImageForm({ block, onChange }: { block: ImageBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Картинка">
      <div>
        <Label className="text-xs text-gray-600">URL картинки</Label>
        <Input
          type="url"
          value={block.src}
          onChange={(e) => onChange({ ...block, src: e.target.value })}
          placeholder="https://images.prrv.tech/…"
        />
        <p className="text-xs text-gray-400 mt-1">
          Используйте Cloudflare R2 или Images CDN — внешние хостинги могут блокироваться почтовиками.
        </p>
      </div>
      <div>
        <Label className="text-xs text-gray-600">Alt-текст</Label>
        <Input
          value={block.alt}
          onChange={(e) => onChange({ ...block, alt: e.target.value })}
          placeholder="Что на картинке (для accessibility)"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Ссылка (опционально)</Label>
        <Input
          type="url"
          value={block.href ?? ""}
          onChange={(e) => onChange({ ...block, href: e.target.value || undefined })}
          placeholder="https://…"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-gray-600">Ширина (px)</Label>
          <Input
            type="number"
            min={50}
            max={600}
            value={block.width ?? ""}
            placeholder="auto"
            onChange={(e) =>
              onChange({ ...block, width: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Выравнивание</Label>
          <AlignmentPicker value={block.align} onChange={(v) => onChange({ ...block, align: v })} />
        </div>
      </div>
    </FormCard>
  );
}

function DividerForm({ block, onChange }: { block: DividerBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Разделитель">
      <div>
        <Label className="text-xs text-gray-600">Цвет</Label>
        <ColorInput
          value={block.color}
          fallback="#e5e7eb"
          onChange={(v) => onChange({ ...block, color: v })}
        />
      </div>
      <div>
        <Label className="text-xs text-gray-600">Толщина (px)</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={block.thickness ?? 1}
          onChange={(e) => onChange({ ...block, thickness: Number(e.target.value) || 1 })}
        />
      </div>
    </FormCard>
  );
}

function SpacerForm({ block, onChange }: { block: SpacerBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Отступ">
      <div>
        <Label className="text-xs text-gray-600">Высота (px)</Label>
        <Input
          type="number"
          min={4}
          max={200}
          value={block.height}
          onChange={(e) => onChange({ ...block, height: Number(e.target.value) || 24 })}
        />
      </div>
    </FormCard>
  );
}

function FooterForm({ block, onChange }: { block: FooterBlock; onChange: (b: EmailBlock) => void }) {
  return (
    <FormCard title="Футер">
      <div>
        <Label className="text-xs text-gray-600">Текст подписи (HTML разрешён)</Label>
        <Textarea
          rows={4}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={block.showUnsubscribeLink}
          onCheckedChange={(v) => onChange({ ...block, showUnsubscribeLink: v === true })}
        />
        Показывать unsubscribe-link
      </label>
      {block.showUnsubscribeLink && (
        <div>
          <Label className="text-xs text-gray-600">Текст ссылки</Label>
          <Input
            value={block.unsubscribeText ?? ""}
            placeholder="Отписаться от рассылки"
            onChange={(e) =>
              onChange({ ...block, unsubscribeText: e.target.value || undefined })
            }
          />
        </div>
      )}
    </FormCard>
  );
}
