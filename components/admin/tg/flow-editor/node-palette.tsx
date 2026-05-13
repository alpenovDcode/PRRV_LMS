"use client";

import type { DragEvent } from "react";

export interface PaletteItem {
  type: string;
  icon: string;
  label: string;
  color: string;
}

// Iter 5: палитра сокращена с 13 до 8 типов. Узкие операции
// (add_tag/remove_tag, add_to_list/remove_from_list, set_variable)
// больше не нужны как отдельные ноды — они стали «Действиями после
// отправки» прямо на message/wait_reply/кнопке. Старые ноды в схеме
// сохраняются для обратной совместимости (уже сохранённые флоу
// продолжают работать), но в палитре их нет.
export const PALETTE_ITEMS: PaletteItem[] = [
  { type: "message", icon: "💬", label: "Сообщение", color: "text-blue-600" },
  { type: "delay", icon: "⏰", label: "Задержка", color: "text-amber-600" },
  { type: "wait_reply", icon: "⌛", label: "Ждать ответ", color: "text-rose-600" },
  { type: "condition", icon: "⚡", label: "Условие", color: "text-fuchsia-600" },
  { type: "http_request", icon: "🌐", label: "HTTP-запрос", color: "text-lime-600" },
  { type: "actions", icon: "🎯", label: "Действия", color: "text-violet-600" },
  { type: "goto_flow", icon: "↪", label: "Прыжок", color: "text-purple-600" },
  { type: "note", icon: "💭", label: "Заметка", color: "text-yellow-600" },
  { type: "end", icon: "⏹", label: "Конец", color: "text-zinc-500" },
];

interface NodePaletteProps {
  onAdd: (type: string) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  const onDragStart = (event: DragEvent<HTMLDivElement>, type: string) => {
    event.dataTransfer.setData("application/x-flow-node-type", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="w-56 shrink-0 border-r bg-white p-3 space-y-1 overflow-auto">
      <div className="text-xs font-semibold text-zinc-400 uppercase px-1 mb-2">
        Палитра нод
      </div>
      {PALETTE_ITEMS.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          onClick={() => onAdd(item.type)}
          className="cursor-grab active:cursor-grabbing rounded-md border border-zinc-200 p-2 flex items-center gap-2 hover:border-purple-300 hover:bg-purple-50/30 transition-colors text-sm select-none"
          title="Click to add at center, or drag to canvas"
        >
          <span className={item.color}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
      <div className="text-[10px] text-zinc-400 px-1 pt-2">
        Тяните на холст или кликните, чтобы добавить.
      </div>
    </aside>
  );
}
