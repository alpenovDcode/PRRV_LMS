"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BLOCK_META } from "./block-icons";
import { createBlock } from "./create-block";
import type { EmailBlock } from "@/lib/email/editor/types";

interface BlockPaletteProps {
  onAddBlock: (block: EmailBlock) => void;
}

const ORDERED: EmailBlock["type"][] = [
  "heading",
  "text",
  "button",
  "image",
  "divider",
  "spacer",
  "footer",
];

/**
 * Палитра блоков. Клик — вставляет блок в конец Canvas.
 *
 * Columns пока не показываем — это сложная вложенность, отложил в Спринт 4
 * (когда нужно будет 2-колоночные карточки в дайджестах).
 */
export function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2 mb-2">
          Блоки
        </div>
        {ORDERED.map((type) => {
          const meta = BLOCK_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onAddBlock(createBlock(type))}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-100 transition-colors text-left"
            >
              <Icon className={`h-4 w-4 ${meta.color}`} />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
