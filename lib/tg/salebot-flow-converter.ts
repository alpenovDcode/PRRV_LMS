/**
 * lib/tg/salebot-flow-converter.ts
 *
 * Конвертер выгрузок воронок SaleBot в наш FlowExport. Авто-детектится
 * импортёром по характерным полям (`messages[]` + `connections[]`).
 *
 * Стратегия маппинга — MVP:
 *
 *   ── messages → nodes ───────────────────────────────────────────────
 *   message_type=0 (текст/медиа)         → message-нода
 *   message_type=4 (HTTP-запрос)         → http_request-нода
 *   message_type=5 (триггер вход.)       → пропускаем как ноду, но
 *                                          собираем triggers и помечаем
 *                                          warning'ом
 *   message_type=6 (условие/ожидание)    → message-нода (если есть
 *                                          answer) или note
 *   message_type=8 (группа-метка)        → note-нода
 *
 *   ── connections → next-указатели ───────────────────────────────────
 *   У source-узла берём ПЕРВУЮ исходящую связь как next.
 *   Если у source несколько исходящих (разные button_index) — остальные
 *   попадают в warnings: «настройте переходы вручную». Это сильное
 *   упрощение — в SaleBot ветвление по кнопкам идёт по button_index,
 *   у нас же кнопка с url ведёт в браузер, а callback-кнопка ловится
 *   через keyword-триггер. Точная конвертация требует ручной правки.
 *
 *   Если у connection задан timeout > 0 — вставляем между source и
 *   target промежуточный delay-узел.
 *   Если shift_to_next_day=true — TG-flow-schema.delayNode НЕ
 *   поддерживает quiet_hours (это messaging-фича), поэтому помечаем
 *   warning'ом.
 *
 *   ── триггеры ────────────────────────────────────────────────────────
 *   /start                              → { type: command, command: "start" }
 *   ключевое-слово                       → { type: keyword, keywords: [w] }
 *   link_was_pressed <URL>              → keyword `link:<URL>` + warning
 *   getcourse <event>                   → keyword `gc:<event>` + warning
 *   кастомные autointensiv_* и т.п.     → keyword <event> + warning
 *
 * Сохраняем входящий граф как ОДИН TgFlow со стартовой нодой = первый
 * не-триггерный узел без входящих связей. Если в выгрузке несколько
 * стартовых точек — попадают в warnings, и админ может потом руками
 * разбить на отдельные флоу.
 */

import type { FlowExport } from "./flow-export";
import type { FlowNode, FlowTrigger } from "./flow-schema";

/**
 * Минимальный shape SaleBot-выгрузки — то, на что мы опираемся. Всё
 * лишнее (analytics_*, file{url}, attachments_settings, и т.п.)
 * проходит насквозь без обработки.
 */
interface SalebotMessage {
  id: number;
  x?: number;
  y?: number;
  message_type: number;
  answer?: string;
  buttons?: string;
  attachment_type?: string;
  attachment_url?: string;
  action_url?: string;
  request_type?: number | null;
  post_params?: string;
  saved_variables?: string;
  description?: string;
  condition?: string;
  compare_variable?: string;
  comparision_method?: number;
  // ...всё остальное
  [k: string]: unknown;
}

interface SalebotConnection {
  id?: number;
  message_a_id: number;
  message_b_id: number;
  button_index?: number | null;
  timeout?: string;
  /** 1=минуты, 60=часы, 3600=суток. (Перевернутое название — SaleBot quirk.) */
  timeout_type?: number;
  send_date?: string;
  send_time?: string;
  shift_to_next_day?: boolean;
  condition?: string;
  compare_variable?: string;
  comparision_method?: number;
  // ...всё остальное
  [k: string]: unknown;
}

interface SalebotPayload {
  messages: SalebotMessage[];
  connections: SalebotConnection[];
  // sheets, project_id — игнорируем
  [k: string]: unknown;
}

interface SalebotButton {
  line?: number;
  index_in_line?: number;
  text: string;
  type?: "inline" | "reply" | string;
  url?: string;
  callback_link?: boolean;
}

export interface SalebotImportWarning {
  code:
    | "MULTI_OUTGOING"
    | "QUIET_HOURS_LOST"
    | "TRIGGER_MANUAL"
    | "UNSUPPORTED_TYPE"
    | "MULTI_START"
    | "ORPHAN_NODE"
    | "EMPTY_TEXT_FALLBACK";
  nodeId?: string;
  message: string;
}

export interface SalebotConvertResult {
  flow: FlowExport;
  warnings: SalebotImportWarning[];
  /** Сколько узлов конвертировано в каждый наш тип — для отчёта. */
  stats: Record<string, number>;
}

/**
 * Быстрый чек по shape: похоже ли это вообще на SaleBot-выгрузку.
 * Используется в API-импорте до тяжёлой валидации.
 */
export function isSalebotFlowExport(input: unknown): input is SalebotPayload {
  if (!input || typeof input !== "object") return false;
  const o = input as Record<string, unknown>;
  return (
    Array.isArray(o.messages) &&
    Array.isArray(o.connections) &&
    o.messages.length > 0 &&
    // Первое сообщение должно иметь message_type — это SaleBot-специфика.
    typeof (o.messages[0] as Record<string, unknown>)?.message_type ===
      "number"
  );
}

/** Безопасно парсит строку buttons из SaleBot в массив объектов. */
function parseSalebotButtons(raw: string | undefined): SalebotButton[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SalebotButton[]) : [];
  } catch {
    return [];
  }
}

/** Очистка текста от плейсхолдера `#{none}` (SaleBot пишет так когда поле «пусто»). */
function cleanAnswer(raw: string | undefined | null): string {
  if (!raw) return "";
  const t = raw.trim();
  if (!t || t === "#{none}") return "";
  // SaleBot-шаблоны #{var} → наш {{var}}. Не идеально (некоторые
  // SaleBot-имена переменных могут содержать спецсимволы), но 95%
  // случаев — простые имена ASCII/цифры/подчёркивания.
  return t.replace(/#\{([a-zA-Z0-9_.]+)\}/g, "{{$1}}");
}

/**
 * Конвертит timeout строку SaleBot в секунды. timeout_type — множитель:
 *   1     → минуты
 *   60    → часы
 *   3600  → сутки
 * (SaleBot хранит это в перевернутом виде — название «type=60» значит
 * «секунды в часу», т.е. время × 60 минут.)
 */
function timeoutToSeconds(raw: string | undefined, type: number | undefined): number {
  if (!raw) return 0;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  switch (type ?? 1) {
    case 1:
      return n * 60; // минуты
    case 60:
      return n * 60 * 60; // часы
    case 3600:
      return n * 60 * 60 * 24; // сутки
    default:
      return n * 60;
  }
}

/**
 * Превращает кнопки SaleBot в наш FlowButton[]. Учитывает группировку
 * по line (SaleBot хранит line/index_in_line — строки и колонки клавы).
 */
function convertButtons(raw: string | undefined): Array<Array<{ text: string; url?: string; callback?: string }>> | undefined {
  const parsed = parseSalebotButtons(raw);
  if (parsed.length === 0) return undefined;
  // Группируем по line.
  const byLine = new Map<number, SalebotButton[]>();
  for (const b of parsed) {
    const line = typeof b.line === "number" ? b.line : 0;
    const arr = byLine.get(line) ?? [];
    arr.push(b);
    byLine.set(line, arr);
  }
  const rows: Array<Array<{ text: string; url?: string; callback?: string }>> = [];
  for (const [, arr] of Array.from(byLine.entries()).sort(
    ([a], [b]) => a - b
  )) {
    arr.sort(
      (a, b) => (a.index_in_line ?? 0) - (b.index_in_line ?? 0)
    );
    rows.push(
      arr.map((b) => {
        // url с шаблоном #{var} → {{var}}
        const cleanUrl = b.url ? cleanAnswer(b.url) : undefined;
        // Кнопка с url — переход в браузер; без url — callback
        if (cleanUrl && /^https?:\/\//.test(cleanUrl)) {
          return { text: b.text.slice(0, 64), url: cleanUrl };
        }
        return {
          text: b.text.slice(0, 64),
          callback: `sb_${b.text.slice(0, 32).replace(/[^a-z0-9_]/gi, "_")}`,
        };
      })
    );
  }
  return rows;
}

/**
 * Главный конвертер. Принимает уже распарсенный JSON-объект SaleBot,
 * отдаёт наш FlowExport + warnings.
 *
 * `name` — имя будущего флоу (можно переопределить из UI).
 */
export function convertSalebotToFlowExport(
  payload: SalebotPayload,
  name: string
): SalebotConvertResult {
  const warnings: SalebotImportWarning[] = [];
  const stats: Record<string, number> = {
    message: 0,
    http_request: 0,
    note: 0,
    delay: 0,
    skipped_trigger: 0,
    skipped_other: 0,
  };

  // ── Индекс id → message для быстрого lookup'а. ─────────────────────
  const msgById = new Map<number, SalebotMessage>();
  for (const m of payload.messages) msgById.set(m.id, m);

  // ── Конвертируем messages в наши узлы (кроме type=5 — это триггеры). ─
  const nodesById = new Map<string, FlowNode>();
  /** Какому SaleBot-id какой наш string-id соответствует. */
  const sbIdToOurId = new Map<number, string>();
  const triggerSourceIds: number[] = [];

  for (const m of payload.messages) {
    const ourId = `n${m.id}`;
    sbIdToOurId.set(m.id, ourId);

    switch (m.message_type) {
      case 5: {
        // Триггер-узел — не превращаем в node, обрабатываем ниже.
        triggerSourceIds.push(m.id);
        stats.skipped_trigger++;
        continue;
      }
      case 0:
      case 6: {
        // Message-нода. Если текст пустой и нет вложений и нет кнопок —
        // делаем note-заглушку.
        const text = cleanAnswer(m.answer);
        const buttons = convertButtons(m.buttons);
        const hasAttachment =
          (m.attachment_type ?? "") !== "" &&
          !!cleanAnswer(m.attachment_url);

        if (!text && !buttons && !hasAttachment) {
          // Превращаем в note чтобы граф не падал из-за пустого text.
          nodesById.set(ourId, {
            id: ourId,
            type: "note",
            text: m.description?.slice(0, 4090) || `SaleBot #${m.id}`,
          } as FlowNode);
          stats.note++;
          warnings.push({
            code: "EMPTY_TEXT_FALLBACK",
            nodeId: ourId,
            message: `Узел #${m.id} не содержал текста/кнопок — конвертирован в заметку.`,
          });
          break;
        }

        // payload: text обязателен min(1). Если answer пустой,
        // но кнопки есть — подставляем плейсхолдер.
        const payloadText = text || "(текст не задан)";
        const attachments = hasAttachment
          ? [
              {
                kind:
                  m.attachment_type === "video"
                    ? ("video" as const)
                    : ("photo" as const),
                url: cleanAnswer(m.attachment_url),
              },
            ]
          : undefined;

        nodesById.set(ourId, {
          id: ourId,
          type: "message",
          payload: {
            text: payloadText.slice(0, 4096),
            ...(attachments ? { attachments } : {}),
            ...(buttons ? { buttonRows: buttons } : {}),
          },
        } as FlowNode);
        stats.message++;
        break;
      }
      case 4: {
        // HTTP-запрос
        const rawUrl = cleanAnswer(m.action_url);
        const method = httpMethodFromCode(m.request_type);
        // URL валидируется как z.string().url() — если шаблонный с {{var}},
        // не пройдёт. Поэтому при наличии {{ заменяем на example.com и
        // вешаем warning. Пользователь правит вручную.
        let url = rawUrl;
        if (!/^https?:\/\//.test(url) || url.includes("{{")) {
          warnings.push({
            code: "EMPTY_TEXT_FALLBACK",
            nodeId: ourId,
            message: `HTTP-узел #${m.id} имеет шаблонный/пустой URL «${rawUrl.slice(0, 80)}» — задайте абсолютный URL вручную.`,
          });
          url = "https://example.com/replace-me";
        }
        nodesById.set(ourId, {
          id: ourId,
          type: "http_request",
          method,
          url,
          ...(m.post_params && m.post_params.trim()
            ? { body: m.post_params }
            : {}),
          ...(m.saved_variables && m.saved_variables.trim()
            ? { saveAs: "response" }
            : {}),
        } as FlowNode);
        stats.http_request++;
        break;
      }
      case 8: {
        // Группа-метка.
        nodesById.set(ourId, {
          id: ourId,
          type: "note",
          text:
            m.description?.slice(0, 4090) || `SaleBot group #${m.id}`,
        } as FlowNode);
        stats.note++;
        break;
      }
      default: {
        // Unknown — превращаем в note чтобы не терять ссылочные связи.
        nodesById.set(ourId, {
          id: ourId,
          type: "note",
          text: `SaleBot тип ${m.message_type} (id ${m.id}) — не поддерживается, требуется ручная замена.`,
        } as FlowNode);
        stats.skipped_other++;
        warnings.push({
          code: "UNSUPPORTED_TYPE",
          nodeId: ourId,
          message: `Тип SaleBot ${m.message_type} (узел ${m.id}) не имеет прямого аналога. Конвертирован в заметку.`,
        });
        break;
      }
    }
  }

  // ── Собираем connections: считаем исходящие у каждого узла. ────────
  const outgoingByFrom = new Map<number, SalebotConnection[]>();
  for (const c of payload.connections) {
    const arr = outgoingByFrom.get(c.message_a_id) ?? [];
    arr.push(c);
    outgoingByFrom.set(c.message_a_id, arr);
  }

  // ── Связываем nodes: для каждого узла берём ПЕРВУЮ исходящую как next. ─
  // Если у узла N>1 исходящих — оставшиеся попадают в warnings (нужна
  // ручная привязка к кнопкам / условиям).
  for (const [fromId, conns] of outgoingByFrom.entries()) {
    const ourFromId = sbIdToOurId.get(fromId);
    if (!ourFromId) continue;
    const node = nodesById.get(ourFromId);
    if (!node) continue; // мог быть триггер-источник

    // Сортируем по button_index — порядок кнопок.
    conns.sort((a, b) => (a.button_index ?? 0) - (b.button_index ?? 0));

    const firstConn = conns[0];
    let targetOurId = sbIdToOurId.get(firstConn.message_b_id);
    if (!targetOurId) continue; // дандгл

    // Если есть timeout — вставляем delay-нода между source и target.
    const sec = timeoutToSeconds(firstConn.timeout, firstConn.timeout_type);
    if (sec > 0) {
      const delayId = `d${firstConn.message_a_id}_${firstConn.message_b_id}`;
      nodesById.set(delayId, {
        id: delayId,
        type: "delay",
        seconds: Math.min(60 * 60 * 24 * 90, Math.max(60, sec)),
      } as FlowNode);
      stats.delay++;
      // node.next → delay → target
      (node as any).next = delayId;
      (nodesById.get(delayId) as any).next = targetOurId;
      if (firstConn.shift_to_next_day) {
        warnings.push({
          code: "QUIET_HOURS_LOST",
          nodeId: delayId,
          message: `Связь ${firstConn.message_a_id} → ${firstConn.message_b_id} имела shift_to_next_day. TG-delay не поддерживает quiet_hours, перепроверьте время.`,
        });
      }
    } else {
      (node as any).next = targetOurId;
    }

    if (conns.length > 1) {
      const extra = conns
        .slice(1)
        .map((c) => sbIdToOurId.get(c.message_b_id) ?? "?")
        .join(", ");
      warnings.push({
        code: "MULTI_OUTGOING",
        nodeId: ourFromId,
        message: `У узла несколько исходящих переходов (${conns.length}). Используется первый (${targetOurId}); остальные [${extra}] — настройте вручную через кнопки/условия.`,
      });
    }
  }

  // ── Собираем триггеры. SaleBot хранит condition на УЗЛЕ (а не как
  // отдельную сущность), причём:
  //   • type=5 узлы — «чистые» триггеры (мы их не превращаем в node)
  //   • type=0/4/6/8 могут иметь свой condition — это «когда этот узел
  //     активируется». В TG модель один FlowTrigger = одна стартовая
  //     точка флоу, поэтому все такие condition сворачиваем в общий
  //     список триггеров. Все они будут запускать flow с startNodeId —
  //     если нужна более точная маршрутизация, админ разнесёт по
  //     отдельным флоу.
  const conditionalIds = new Set<number>();
  for (const trId of triggerSourceIds) conditionalIds.add(trId);
  for (const m of payload.messages) {
    if (m.message_type === 5) continue;
    const c = (m.condition ?? "").trim();
    if (c && c !== "#{none}") conditionalIds.add(m.id);
  }
  const seenTriggerSig = new Set<string>();
  const triggers: FlowTrigger[] = [];
  for (const trId of conditionalIds) {
    const m = msgById.get(trId);
    if (!m) continue;
    const cond = (m.condition ?? "").trim();
    if (!cond || cond === "#{none}") continue;
    // Дедуп — один и тот же condition мог встретиться на нескольких узлах.
    const sig = `${cond}`.toLowerCase();
    if (seenTriggerSig.has(sig)) continue;
    seenTriggerSig.add(sig);

    // /start
    if (cond === "/start") {
      triggers.push({ type: "command", command: "start" });
      continue;
    }
    // link_was_pressed <URL>
    if (cond.startsWith("link_was_pressed ")) {
      const url = cond.slice("link_was_pressed ".length).trim();
      triggers.push({
        type: "keyword",
        keywords: [`link:${url}`],
        matchMode: "exact",
      });
      warnings.push({
        code: "TRIGGER_MANUAL",
        message: `Триггер «при клике по ${url}» создан как keyword «link:<url>». Привяжите вручную: TG-аналог — link_clicked на трекинг-ссылке (есть в Messaging-флоу, для TG настраивается отдельно).`,
      });
      continue;
    }
    // getcourse <event>
    if (cond.startsWith("getcourse ")) {
      const event = cond.slice("getcourse ".length).trim();
      triggers.push({
        type: "keyword",
        keywords: [`gc:${event}`],
        matchMode: "exact",
      });
      warnings.push({
        code: "TRIGGER_MANUAL",
        message: `Триггер GetCourse «${event}» создан как keyword «gc:${event}». Настройте внешний вебхук в GetCourse, который шлёт это keyword боту (или подключите external_event-триггер если канал MAX).`,
      });
      continue;
    }
    // Остальное — кастомные SaleBot-события (autointensiv_*, client_unsubscribed, ...)
    triggers.push({
      type: "keyword",
      keywords: [cond],
      matchMode: "exact",
    });
    warnings.push({
      code: "TRIGGER_MANUAL",
      message: `Кастомный SaleBot-триггер «${cond}» создан как keyword. Если запускается из внешнего сервиса — настройте вебхук, шлющий это keyword боту.`,
    });
  }

  // ── Подбираем startNodeId: первый узел без входящих connections, ──
  // не считая триггер-источников (тип 5).
  const incoming = new Set<string>();
  for (const c of payload.connections) {
    const t = sbIdToOurId.get(c.message_b_id);
    if (t) incoming.add(t);
  }
  const candidates = Array.from(nodesById.entries())
    .filter(([id]) => !incoming.has(id))
    .map(([id]) => id);

  let startNodeId: string;
  if (candidates.length === 0) {
    // Все узлы имеют входящие. Берём первый по позиции — лучшего выбора нет.
    startNodeId = Array.from(nodesById.keys())[0];
    warnings.push({
      code: "MULTI_START",
      message:
        "В графе нет ни одного узла без входящих связей — все узлы взаимосвязаны. Стартовая нода выбрана автоматически — проверьте и переназначьте.",
    });
  } else {
    startNodeId = candidates[0];
    if (candidates.length > 1) {
      warnings.push({
        code: "MULTI_START",
        message: `Найдено ${candidates.length} возможных стартовых узлов: ${candidates.slice(0, 5).join(", ")}${candidates.length > 5 ? "..." : ""}. Использован первый. SaleBot позволяет несколько входов на воронку — в LMS один TG-флоу = одна стартовая нода. При необходимости разнесите по разным флоу.`,
      });
    }
  }

  // Если в nodesById пусто (бывает на полностью пустой выгрузке) —
  // делаем синтетический note чтобы FlowExport валидировался (min 1).
  if (nodesById.size === 0) {
    nodesById.set("n_empty", {
      id: "n_empty",
      type: "note",
      text: "Импорт SaleBot вернул пустой граф.",
    } as FlowNode);
    startNodeId = "n_empty";
  }

  // ── Проверка на orphan-узлы (без incoming и без outgoing — кроме старта). ─
  for (const [id, node] of nodesById) {
    if (id === startNodeId) continue;
    const hasIncoming = incoming.has(id);
    const hasOutgoing = !!(node as any).next;
    if (!hasIncoming && !hasOutgoing) {
      warnings.push({
        code: "ORPHAN_NODE",
        nodeId: id,
        message: `Узел ${id} не связан ни с одним другим — недостижим из графа.`,
      });
    }
  }

  // ── Собираем итоговый FlowExport. ──────────────────────────────────
  const exp: FlowExport = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    name: name.slice(0, 120) || "SaleBot import",
    description: `Импорт из SaleBot. ${payload.messages.length} исходных узлов, ${payload.connections.length} связей.`,
    graph: {
      version: 1,
      startNodeId,
      nodes: Array.from(nodesById.values()),
    },
    triggers,
  };

  return { flow: exp, warnings, stats };
}

function httpMethodFromCode(
  code: number | null | undefined
): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  // SaleBot хранит request_type как число; точного маппинга нет в
  // публичной доке, но эмпирически 1=GET, 2=POST. Дефолт — POST,
  // потому что у HTTP-узлов чаще всего нужен body.
  switch (code) {
    case 1:
      return "GET";
    case 3:
      return "PUT";
    case 4:
      return "DELETE";
    default:
      return "POST";
  }
}
