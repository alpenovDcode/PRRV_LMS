import {
  Heading,
  Type,
  MousePointer,
  Image as ImageIcon,
  Minus,
  MoveVertical,
  AlignJustify,
  Columns,
} from "lucide-react";
import type { EmailBlock } from "@/lib/email/editor/types";

/**
 * Иконка для блока — используется в палитре и в карточках Canvas.
 */
export const BLOCK_META: Record<
  EmailBlock["type"],
  { label: string; icon: typeof Type; color: string }
> = {
  heading: { label: "Заголовок", icon: Heading, color: "text-amber-600" },
  text: { label: "Текст", icon: Type, color: "text-blue-600" },
  button: { label: "Кнопка", icon: MousePointer, color: "text-emerald-600" },
  image: { label: "Картинка", icon: ImageIcon, color: "text-purple-600" },
  divider: { label: "Разделитель", icon: Minus, color: "text-gray-500" },
  spacer: { label: "Отступ", icon: MoveVertical, color: "text-gray-500" },
  footer: { label: "Футер", icon: AlignJustify, color: "text-rose-600" },
  columns: { label: "Колонки", icon: Columns, color: "text-indigo-600" },
};
