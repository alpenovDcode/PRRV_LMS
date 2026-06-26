import type { EmailBlock } from "@/lib/email/editor/types";

/** Дефолтные значения для новых блоков, когда маркетолог нажимает на палитру. */
export function createBlock(type: EmailBlock["type"]): EmailBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type: "heading", level: 2, text: "Новый заголовок", align: "left" };
    case "text":
      return {
        id,
        type: "text",
        html: "<p>Введите текст письма…</p>",
        align: "left",
        fontSize: 16,
      };
    case "button":
      return {
        id,
        type: "button",
        text: "Кнопка",
        url: "https://prrv.tech/",
        align: "center",
        backgroundColor: "#2563eb",
        textColor: "#ffffff",
      };
    case "image":
      return {
        id,
        type: "image",
        src: "",
        alt: "",
        align: "center",
      };
    case "divider":
      return { id, type: "divider", color: "#e5e7eb", thickness: 1 };
    case "spacer":
      return { id, type: "spacer", height: 24 };
    case "footer":
      return {
        id,
        type: "footer",
        text: "Прорыв — школа онлайн-репетиторов.",
        showUnsubscribeLink: true,
      };
    case "columns":
      return {
        id,
        type: "columns",
        columnCount: 2,
        columns: [{ blocks: [] }, { blocks: [] }],
      };
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown block type: ${exhaustive as string}`);
    }
  }
}
