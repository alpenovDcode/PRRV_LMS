/**
 * Модель блочного письма.
 *
 * Документ — массив блоков. Каждый блок — независимая единица с собственными
 * атрибутами. Это намеренно проще TipTap-документа: для email-блоков с настройками
 * (URL кнопки, src картинки, цвет фона) NodeView-машинерия ProseMirror — overkill.
 *
 * Rich-text внутри text/heading блоков хранится как HTML-строка (генерируется
 * TipTap'ом внутри text-block формы). Это даёт жирный/курсив/ссылки без отдельной
 * структуры, и компилятору не нужно знать про схему ProseMirror.
 *
 * Хранение: EmailVisualTemplate.blocks (Json) = EmailDocument.
 */

export type BlockAlignment = "left" | "center" | "right";

/** Общие свойства каждого блока. */
interface BlockBase {
  id: string; // uuid (генерируется на клиенте при добавлении)
  type: string;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
  color?: string; // CSS color, default #1f2937
  align?: BlockAlignment;
}

export interface TextBlock extends BlockBase {
  type: "text";
  /**
   * HTML с inline-rich-text (bold, italic, links, lists). Содержит ТОЛЬКО
   * безопасные теги: b, strong, i, em, u, a, br, p, ul, ol, li. Прогоняется
   * через sanitize-html при сохранении шаблона.
   */
  html: string;
  align?: BlockAlignment;
  fontSize?: number; // px, default 16
  color?: string; // default #374151
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  text: string;
  url: string;
  align?: BlockAlignment;
  backgroundColor?: string; // default #2563eb
  textColor?: string; // default #ffffff
  /** px, по периметру кнопки */
  paddingY?: number;
  paddingX?: number;
  /** px, скругление */
  borderRadius?: number;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  /** Полный URL картинки. Картинки писем лежат в Cloudflare R2, bucket email-assets. */
  src: string;
  alt: string;
  /** px. Если задано — width применяется через атрибут width (Outlook не понимает CSS width). */
  width?: number;
  align?: BlockAlignment;
  /** Опциональная ссылка, в которую заворачивается картинка. */
  href?: string;
}

export interface DividerBlock extends BlockBase {
  type: "divider";
  color?: string; // default #e5e7eb
  thickness?: number; // px, default 1
}

export interface SpacerBlock extends BlockBase {
  type: "spacer";
  height: number; // px, default 24
}

export interface FooterBlock extends BlockBase {
  type: "footer";
  /**
   * Произвольный текст подписи. Контакты бренда, юр.адрес и т.п.
   * Поддерживает переменные {{var}}.
   */
  text: string;
  /**
   * Включать ли обязательный unsubscribe-link.
   * По умолчанию true — отключить можно только в особых случаях.
   * В письма категории "marketing" обязателен по закону.
   */
  showUnsubscribeLink: boolean;
  unsubscribeText?: string; // default "Отписаться от рассылки"
}

export interface ColumnsBlock extends BlockBase {
  type: "columns";
  /** 2 или 3 колонки. */
  columnCount: 2 | 3;
  /** Колонки. Каждая содержит вложенные блоки (кроме columns — без рекурсии). */
  columns: Array<{
    blocks: Exclude<EmailBlock, ColumnsBlock>[];
  }>;
}

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | FooterBlock
  | ColumnsBlock;

export interface EmailDocument {
  /** Глобальные настройки письма. */
  settings: {
    /** Цвет фона за пределами белой «карточки» письма. */
    backgroundColor: string;
    /** Ширина контента в px. Стандарт писем — 600. */
    contentWidth: number;
    /** Шрифт по умолчанию. Web-safe для писем. */
    fontFamily: string;
    /** Базовый цвет ссылок. */
    linkColor: string;
  };
  blocks: EmailBlock[];
}

export const DEFAULT_SETTINGS: EmailDocument["settings"] = {
  backgroundColor: "#f3f4f6",
  contentWidth: 600,
  fontFamily: "Helvetica, Arial, sans-serif",
  linkColor: "#2563eb",
};

/**
 * Создаёт пустой документ — для нового шаблона.
 */
export function createEmptyDocument(): EmailDocument {
  return {
    settings: DEFAULT_SETTINGS,
    blocks: [],
  };
}
