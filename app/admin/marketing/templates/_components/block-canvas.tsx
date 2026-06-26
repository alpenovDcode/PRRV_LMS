"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Trash2, Copy } from "lucide-react";
import { BLOCK_META } from "./block-icons";
import type { EmailBlock, EmailDocument } from "@/lib/email/editor/types";

interface BlockCanvasProps {
  document: EmailDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

/**
 * Центральная область редактора. Показывает блоки в порядке как они будут в письме,
 * упрощённое визуальное представление (не полный compile-результат — для этого Preview).
 *
 * Каждый блок:
 *   - Выделяется при клике (highlight border)
 *   - При hover показывает кнопки действий (вверх/вниз, дублировать, удалить)
 *   - Дёргает соответствующие колбэки, передавая id
 */
export function BlockCanvas({
  document,
  selectedId,
  onSelect,
  onMove,
  onDelete,
  onDuplicate,
}: BlockCanvasProps) {
  return (
    <Card style={{ backgroundColor: document.settings.backgroundColor }}>
      <CardContent className="p-6 min-h-[60vh]">
        <div
          className="mx-auto bg-white rounded-lg shadow-sm"
          style={{ maxWidth: `${document.settings.contentWidth}px` }}
        >
          {document.blocks.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              Письмо пустое. Добавьте блок из палитры слева.
            </div>
          ) : (
            <div className="divide-y divide-transparent">
              {document.blocks.map((block, idx) => (
                <BlockPreview
                  key={block.id}
                  block={block}
                  document={document}
                  isSelected={selectedId === block.id}
                  isFirst={idx === 0}
                  isLast={idx === document.blocks.length - 1}
                  onClick={() => onSelect(block.id)}
                  onMove={(dir) => onMove(block.id, dir)}
                  onDelete={() => onDelete(block.id)}
                  onDuplicate={() => onDuplicate(block.id)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface BlockPreviewProps {
  block: EmailBlock;
  document: EmailDocument;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function BlockPreview({
  block,
  document,
  isSelected,
  isFirst,
  isLast,
  onClick,
  onMove,
  onDelete,
  onDuplicate,
}: BlockPreviewProps) {
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-blue-400 rounded-md" : "hover:bg-blue-50/30"
      }`}
    >
      {/* Toolbar поверх блока при выборе/hover */}
      <div
        className={`absolute -top-3 right-2 z-10 flex gap-1 ${
          isSelected ? "" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 bg-white shadow-sm"
          disabled={isFirst}
          onClick={() => onMove("up")}
          title="Вверх"
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 bg-white shadow-sm"
          disabled={isLast}
          onClick={() => onMove("down")}
          title="Вниз"
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 bg-white shadow-sm"
          onClick={onDuplicate}
          title="Дублировать"
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 bg-white shadow-sm text-red-600 hover:text-red-700"
          onClick={onDelete}
          title="Удалить"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Тип-метка слева */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <Icon className={`h-3 w-3 ${meta.color}`} />
        <span>{meta.label}</span>
      </div>

      {/* Содержимое блока — упрощённый рендер */}
      <BlockBody block={block} document={document} />
    </div>
  );
}

function BlockBody({ block, document }: { block: EmailBlock; document: EmailDocument }) {
  const fontFamily = document.settings.fontFamily;

  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? 28 : block.level === 2 ? 22 : 18;
      return (
        <div
          style={{
            padding: "12px 24px",
            textAlign: block.align ?? "left",
            color: block.color ?? "#1f2937",
            fontFamily,
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {block.text || <span className="text-gray-300">[заголовок]</span>}
        </div>
      );
    }
    case "text":
      return (
        <div
          style={{
            padding: "8px 24px",
            textAlign: block.align ?? "left",
            color: block.color ?? "#374151",
            fontFamily,
            fontSize: block.fontSize ?? 16,
            lineHeight: 1.55,
          }}
          dangerouslySetInnerHTML={{ __html: block.html || "<p class='text-gray-300'>[текст]</p>" }}
        />
      );
    case "button":
      return (
        <div style={{ padding: "16px 24px", textAlign: block.align ?? "center" }}>
          <span
            style={{
              display: "inline-block",
              backgroundColor: block.backgroundColor ?? "#2563eb",
              color: block.textColor ?? "#ffffff",
              padding: `${block.paddingY ?? 14}px ${block.paddingX ?? 28}px`,
              borderRadius: `${block.borderRadius ?? 8}px`,
              fontWeight: 700,
              fontFamily,
            }}
          >
            {block.text || "Кнопка"}
          </span>
        </div>
      );
    case "image":
      return (
        <div style={{ padding: "8px 24px", textAlign: block.align ?? "center" }}>
          {block.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.src}
              alt={block.alt}
              style={{
                maxWidth: block.width ? `${block.width}px` : "100%",
                height: "auto",
                display: "inline-block",
              }}
            />
          ) : (
            <div className="bg-gray-100 border-2 border-dashed border-gray-200 rounded p-6 text-xs text-gray-400">
              [картинка — добавьте URL в свойствах]
            </div>
          )}
        </div>
      );
    case "divider":
      return (
        <div style={{ padding: "12px 24px" }}>
          <div
            style={{
              borderTop: `${block.thickness ?? 1}px solid ${block.color ?? "#e5e7eb"}`,
            }}
          />
        </div>
      );
    case "spacer":
      return (
        <div
          style={{
            height: `${Math.max(1, block.height)}px`,
            background:
              "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.03) 6px, rgba(0,0,0,0.03) 12px)",
          }}
        />
      );
    case "footer":
      return (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            fontFamily,
            fontSize: 12,
            color: "#6b7280",
            lineHeight: 1.5,
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: block.text || "" }} />
          {block.showUnsubscribeLink && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
              <span style={{ textDecoration: "underline" }}>
                {block.unsubscribeText || "Отписаться от рассылки"}
              </span>
            </div>
          )}
        </div>
      );
    case "columns":
      return (
        <div className="grid gap-2 p-4" style={{ gridTemplateColumns: `repeat(${block.columnCount}, 1fr)` }}>
          {block.columns.map((col, idx) => (
            <div key={idx} className="border border-dashed border-gray-200 rounded p-3 text-xs text-gray-400">
              Колонка {idx + 1}: {col.blocks.length} блоков
            </div>
          ))}
        </div>
      );
    default: {
      const exhaustive: never = block;
      return <div>Unknown block: {(exhaustive as EmailBlock).type}</div>;
    }
  }
}
