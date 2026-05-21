// Ready-to-import flow templates surfaced in the "New flow" dialog.
// Designed to be self-explanatory in the JSON editor too — every node
// has a `label` so reviewers can navigate them.

import type { FlowGraph, FlowTrigger } from "./flow-schema";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  graph: FlowGraph;
  triggers: FlowTrigger[];
}

export const TEMPLATE_FLOWS: FlowTemplate[] = [
  {
    id: "welcome",
    name: "Приветствие на /start",
    description: "Простое приветствие новых подписчиков с двумя кнопками-ответами.",
    triggers: [{ type: "command", command: "start" }],
    graph: {
      version: 1,
      startNodeId: "msg-welcome",
      nodes: [
        {
          id: "msg-welcome",
          type: "message",
          label: "Приветствие",
          payload: {
            text: "Привет, {{user.first_name}} 👋\nЧем я могу помочь?",
            buttonRows: [
              [
                { text: "О курсе", callback: "goto:about" },
                { text: "Связаться", callback: "goto:contact" },
              ],
            ],
          },
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "lead-magnet",
    name: "Лид-магнит → подогрев",
    description:
      "Выдаёт лид-магнит, ставит тег, через 1 час и 1 день шлёт подогревающие сообщения.",
    triggers: [
      { type: "command", command: "start", payloads: ["leadmagnet"] },
      { type: "keyword", keywords: ["хочу гайд", "получить гайд"] },
    ],
    graph: {
      version: 1,
      startNodeId: "msg-gift",
      nodes: [
        {
          id: "msg-gift",
          type: "message",
          label: "Выдача гайда",
          payload: {
            text: "Лови гайд: https://example.com/guide.pdf\nПолучить ещё материалы — нажми кнопку.",
            buttonRows: [[{ text: "Хочу больше", callback: "tag:add:warm" }]],
          },
          next: "tag-leadmagnet",
        },
        { id: "tag-leadmagnet", type: "add_tag", label: "Тег leadmagnet", tag: "leadmagnet", next: "delay-1h" },
        { id: "delay-1h", type: "delay", label: "Пауза 1 час", seconds: 3600, next: "msg-warm1" },
        {
          id: "msg-warm1",
          type: "message",
          label: "Касание 1ч",
          payload: { text: "Успел изучить гайд? Главное — внедрить, а не сохранить в закладки 😉" },
          next: "delay-1d",
        },
        { id: "delay-1d", type: "delay", label: "Пауза 1 день", seconds: 86400, next: "msg-warm2" },
        {
          id: "msg-warm2",
          type: "message",
          label: "Касание 1д",
          payload: {
            text: "Если хочешь обсудить, какой следующий шаг сделать — напиши, я подскажу.",
          },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "quiz",
    name: "Мини-квиз → сегментация",
    description: "Задаёт 1 вопрос, по ответу проставляет разные теги и стартует разные ветки.",
    triggers: [{ type: "command", command: "quiz" }],
    graph: {
      version: 1,
      startNodeId: "msg-q1",
      nodes: [
        {
          id: "msg-q1",
          type: "message",
          label: "Вопрос",
          payload: {
            text: "Какой у тебя стек?",
            buttonRows: [
              [
                { text: "Frontend", callback: "tag:add:stack_fe" },
                { text: "Backend", callback: "tag:add:stack_be" },
                { text: "Full-stack", callback: "tag:add:stack_fs" },
              ],
            ],
          },
          next: "wait-reply",
        },
        {
          id: "wait-reply",
          type: "wait_reply",
          label: "Жду ответа",
          saveAs: "stack_text",
          timeoutSeconds: 86400,
          timeoutNext: "msg-timeout",
          next: "msg-thanks",
        },
        {
          id: "msg-thanks",
          type: "message",
          label: "Спасибо",
          payload: { text: "Принял! Подберу для тебя релевантный контент." },
          next: "end",
        },
        {
          id: "msg-timeout",
          type: "message",
          label: "Таймаут",
          payload: { text: "Если передумаешь — напиши /quiz ещё раз." },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "nps",
    name: "NPS-опрос (5 звёзд)",
    description:
      "Отправляет шкалу 1-5 как inline-кнопки, при 5⭐ сохраняет в deal-vars и просит отзыв; при 1-3⭐ ставит тег detractor и предлагает связаться.",
    triggers: [{ type: "command", command: "nps" }],
    graph: {
      version: 1,
      startNodeId: "msg-nps-q",
      nodes: [
        {
          id: "msg-nps-q",
          type: "message",
          label: "Шкала NPS",
          payload: {
            text: "Оцените курс от 1 до 5 ⭐",
            buttonRows: [
              [
                { text: "1⭐", onClick: { setVariables: [{ key: "deal.nps", value: "1" }] } },
                { text: "2⭐", onClick: { setVariables: [{ key: "deal.nps", value: "2" }] } },
                { text: "3⭐", onClick: { setVariables: [{ key: "deal.nps", value: "3" }] } },
                { text: "4⭐", onClick: { setVariables: [{ key: "deal.nps", value: "4" }] } },
                { text: "5⭐", onClick: { setVariables: [{ key: "deal.nps", value: "5" }] } },
              ],
            ],
          },
          next: "wait-nps",
        },
        {
          id: "wait-nps",
          type: "wait_reply",
          label: "Ждём клик",
          saveAs: "deal._nps_raw",
          timeoutSeconds: 86400,
          timeoutNext: "end",
          next: "cond-nps",
        },
        {
          id: "cond-nps",
          type: "condition",
          label: "Promoter / Detractor",
          rules: [
            {
              kind: "variable",
              params: { key: "deal.nps", op: "gte", value: "4" },
              next: "msg-thanks",
            },
          ],
          defaultNext: "msg-detractor",
        },
        {
          id: "msg-thanks",
          type: "message",
          label: "Промоутер",
          payload: {
            text: "Спасибо за оценку! Будем благодарны за отзыв 🙏",
            onSend: { addTags: ["nps_promoter"] },
          },
          next: "end",
        },
        {
          id: "msg-detractor",
          type: "message",
          label: "Детректор",
          payload: {
            text: "Жаль, что не идеально. Куратор свяжется с вами в течение часа.",
            onSend: { addTags: ["nps_detractor"] },
          },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "course-onboarding",
    name: "Онбординг покупателя курса",
    description:
      "День 0 — welcome + ссылка в личный кабинет. День 1, 3, 7 — напоминания «продолжи учиться». Запускается извне через goto_flow или /start onboard.",
    triggers: [{ type: "command", command: "start", payloads: ["onboard"] }],
    graph: {
      version: 1,
      startNodeId: "msg-day0",
      nodes: [
        {
          id: "msg-day0",
          type: "message",
          label: "День 0 — welcome",
          payload: {
            text: "Добро пожаловать на курс, {{user.first_name}} 🎓\nВот ваш личный кабинет: {{project.lms_url}}",
            onSend: { addTags: ["course_active"] },
          },
          next: "delay-day1",
        },
        { id: "delay-day1", type: "delay", label: "+1 день", seconds: 86400, next: "msg-day1" },
        {
          id: "msg-day1",
          type: "message",
          label: "День 1",
          payload: { text: "Как продвигается? Не забудьте про первое задание — оно открывает доступ к материалам недели." },
          next: "delay-day3",
        },
        { id: "delay-day3", type: "delay", label: "+2 дня (= день 3)", seconds: 172800, next: "msg-day3" },
        {
          id: "msg-day3",
          type: "message",
          label: "День 3",
          payload: { text: "Прошло 3 дня. Если что-то непонятно — куратор отвечает в этом чате." },
          next: "delay-day7",
        },
        { id: "delay-day7", type: "delay", label: "+4 дня (= день 7)", seconds: 345600, next: "msg-day7" },
        {
          id: "msg-day7",
          type: "message",
          label: "День 7 — чек-ин",
          payload: { text: "Неделя на курсе! Поделитесь, что получилось — отвечу или передам кураторам." },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "abandoned-cart",
    name: "Брошенная корзина (3 касания)",
    description:
      "Через 30 мин, 2 ч и 24 ч после установки тега `cart_pending` шлёт три касания с увеличивающейся настойчивостью. На любом этапе остановится, если тег снять.",
    triggers: [],
    graph: {
      version: 1,
      startNodeId: "delay-30m",
      nodes: [
        { id: "delay-30m", type: "delay", label: "+30 мин", seconds: 1800, next: "cond-still" },
        {
          id: "cond-still",
          type: "condition",
          label: "Корзина ещё актуальна?",
          rules: [
            { kind: "tag", params: { op: "has", value: "cart_pending" }, next: "msg-1" },
          ],
          defaultNext: "end",
        },
        {
          id: "msg-1",
          type: "message",
          label: "Касание 1 (мягко)",
          payload: { text: "Вы оставили курс в корзине. Закончим оформление?" },
          next: "delay-2h",
        },
        { id: "delay-2h", type: "delay", label: "+2 часа", seconds: 7200, next: "cond-still-2" },
        {
          id: "cond-still-2",
          type: "condition",
          label: "Ещё в корзине?",
          rules: [
            { kind: "tag", params: { op: "has", value: "cart_pending" }, next: "msg-2" },
          ],
          defaultNext: "end",
        },
        {
          id: "msg-2",
          type: "message",
          label: "Касание 2 (со скидкой)",
          payload: { text: "У нас остался час до закрытия скидки 10% — промокод RETURN10." },
          next: "delay-24h",
        },
        { id: "delay-24h", type: "delay", label: "+24 часа", seconds: 86400, next: "cond-still-3" },
        {
          id: "cond-still-3",
          type: "condition",
          label: "Ещё держится?",
          rules: [
            { kind: "tag", params: { op: "has", value: "cart_pending" }, next: "msg-3" },
          ],
          defaultNext: "end",
        },
        {
          id: "msg-3",
          type: "message",
          label: "Касание 3 (последнее)",
          payload: { text: "Последнее напоминание: места на потоке заканчиваются. Готовы записаться?" },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
  {
    id: "blank",
    name: "Пустой сценарий",
    description: "Минимальная заготовка с одним сообщением.",
    triggers: [],
    graph: {
      version: 1,
      startNodeId: "msg-1",
      nodes: [
        {
          id: "msg-1",
          type: "message",
          label: "Сообщение 1",
          payload: { text: "Привет!" },
          next: "end",
        },
        { id: "end", type: "end", label: "Конец" },
      ],
    },
  },
];
