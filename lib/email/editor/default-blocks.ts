import { randomUUID } from "crypto";
import type { EmailBlock, EmailDocument } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/**
 * Стартовые макеты для нового шаблона. Маркетолог выбирает на /templates/new.
 *
 * Дизайн намеренно простой: серый фон + белая «карточка» 600px + контент
 * прорывовскими цветами. Под бренд расширим после получения мастер-шаблона
 * от Unisender (80К ₽ из КП).
 */

function id(): string {
  return randomUUID();
}

export type StartingLayout = "blank" | "promo" | "digest" | "welcome";

export const STARTING_LAYOUTS: Array<{
  key: StartingLayout;
  name: string;
  description: string;
}> = [
  { key: "blank", name: "Пустой", description: "Только пустой холст — соберу с нуля." },
  {
    key: "promo",
    name: "Промо с кнопкой",
    description: "Баннер + заголовок + текст + большая кнопка призыва к действию.",
  },
  {
    key: "digest",
    name: "Дайджест",
    description: "Шапка + несколько разделов с заголовком, текстом и ссылками.",
  },
  {
    key: "welcome",
    name: "Welcome",
    description: "Приветствие нового пользователя с инструкцией и кнопкой входа в кабинет.",
  },
];

export function buildStartingDocument(layout: StartingLayout): EmailDocument {
  const settings = { ...DEFAULT_SETTINGS };
  if (layout === "blank") {
    return { settings, blocks: [] };
  }

  if (layout === "promo") {
    return {
      settings,
      blocks: [
        {
          id: id(),
          type: "heading",
          level: 1,
          text: "Заголовок акции",
          align: "center",
        },
        {
          id: id(),
          type: "text",
          html: "<p>Расскажи в одном-двух абзацах, почему это важно и что получит читатель. Минимум воды — больше пользы.</p>",
          align: "left",
        },
        {
          id: id(),
          type: "button",
          text: "Узнать подробности",
          url: "https://prrv.tech/",
          align: "center",
        },
        {
          id: id(),
          type: "divider",
        },
        {
          id: id(),
          type: "footer",
          text: "Прорыв — школа онлайн-репетиторов.",
          showUnsubscribeLink: true,
        },
      ],
    };
  }

  if (layout === "digest") {
    return {
      settings,
      blocks: [
        {
          id: id(),
          type: "heading",
          level: 1,
          text: "Новости недели",
          align: "left",
        },
        {
          id: id(),
          type: "text",
          html: "<p>Привет, {{firstName}}! Собрали для вас что важного произошло за неделю.</p>",
          align: "left",
        },
        { id: id(), type: "divider" },
        {
          id: id(),
          type: "heading",
          level: 2,
          text: "Тема 1",
          align: "left",
        },
        {
          id: id(),
          type: "text",
          html: "<p>Короткое описание темы и <a href=\"https://prrv.tech/\">ссылка на материал</a>.</p>",
          align: "left",
        },
        { id: id(), type: "divider" },
        {
          id: id(),
          type: "heading",
          level: 2,
          text: "Тема 2",
          align: "left",
        },
        {
          id: id(),
          type: "text",
          html: "<p>Короткое описание темы и ссылка на материал.</p>",
          align: "left",
        },
        {
          id: id(),
          type: "footer",
          text: "Прорыв — школа онлайн-репетиторов.",
          showUnsubscribeLink: true,
        },
      ],
    };
  }

  // welcome
  return {
    settings,
    blocks: [
      {
        id: id(),
        type: "heading",
        level: 1,
        text: "Привет, {{firstName}}!",
        align: "left",
      },
      {
        id: id(),
        type: "text",
        html: "<p>Рады что вы с нами. Прорыв — это школа, которая помогает репетиторам выстроить онлайн-практику и стабильный доход.</p><p>Чтобы начать, заходите в личный кабинет — там уже ждут первые уроки.</p>",
        align: "left",
      },
      {
        id: id(),
        type: "button",
        text: "Войти в кабинет",
        url: "https://prrv.tech/dashboard",
        align: "center",
      },
      {
        id: id(),
        type: "spacer",
        height: 16,
      },
      {
        id: id(),
        type: "text",
        html: "<p>Если что-то непонятно — просто ответьте на это письмо, разберёмся.</p>",
        align: "left",
        fontSize: 14,
        color: "#6b7280",
      },
      { id: id(), type: "divider" },
      {
        id: id(),
        type: "footer",
        text: "Прорыв — школа онлайн-репетиторов.",
        showUnsubscribeLink: true,
      },
    ] as EmailBlock[],
  };
}
