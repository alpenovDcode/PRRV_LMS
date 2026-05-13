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
