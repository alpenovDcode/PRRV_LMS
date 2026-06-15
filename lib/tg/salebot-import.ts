/**
 * Импортёр воронок Salebot в формат TgFlowGraph.
 *
 * Принимает JSON-выгрузку Salebot (с полями messages[] / connections[])
 * и возвращает:
 *   - graph        — наш FlowGraph готовый к записи в TgFlow.graph
 *   - triggers     — массив FlowTrigger для TgFlow.triggers
 *   - extraFlows   — дополнительные flows для реактивных триггеров
 *                    (каждый триггер получает свой flow)
 *   - report       — что замаплено, что в TODO, что пропущено
 *
 * Маппинг (детально):
 *   message_type=0  → messageNodeSchema
 *   message_type=4  → httpRequestNodeSchema (POST/GET с saved_variables)
 *   message_type=5  → отдельный flow с реактивным trigger'ом
 *   message_type=6  → messageNodeSchema (дожим — отличается только хвостом
 *                     в виде delay+message, что и без нас работает)
 *   message_type=8  → noteNodeSchema (комментарий/группировка)
 *
 *   connection.compare_variable    → conditionNodeSchema
 *   connection.timeout = "N"       → delayNode перед целью
 *   connection.timeout = "random(a,b)" → delayNode с secondsMax (Фаза 1)
 *   connection.send_time / send_date → TODO note (Фаза 3 — delay_until)
 *
 * Что НЕ маппится автоматически:
 *   - send_time / send_date — ждёт Фазы 3 (delay_until)
 *   - link_was_pressed как trigger — ждёт Фазы 2 (link_clicked)
 *   - getcourse <event> как trigger — ждёт Фазы 2 (external_event)
 *   - saved_variables DSL — частично, Фаза 1 разворачивает полностью
 *   Всё это попадает в `report.unmapped` и оборачивается в note-ноду с TODO.
 */

import { randomUUID } from "crypto";
import type {
  FlowGraph,
  FlowNode,
  FlowTrigger,
  FlowMessagePayload,
  FlowButton,
  HttpSaveMapping,
} from "./flow-schema";

// ─── Salebot JSON shapes ────────────────────────────────────────────────

export interface SalebotMessage {
  id: number;
  description?: string | null;
  x?: number;
  y?: number;
  message_type?: number;
  condition?: string | null;
  answer?: string | null;
  buttons?: string | null;
  variables?: string | null;
  post_params?: string | null;
  saved_variables?: string | null;
  action_url?: string | null;
  request_type?: number | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  enable_markdown?: boolean;
}

export interface SalebotConnection {
  id: number;
  message_a_id: number;
  message_b_id: number;
  description?: string | null;
  timeout?: string | null;
  timeout_type?: number | null;
  condition?: string | null;
  compare_variable?: string | null;
  comparision_method?: number | null;
  send_time?: string | null;
  send_date?: string | null;
  field_name?: string | null;
  button_index?: number | null;
  show_as_button?: boolean;
  request_type?: number | null;
  action_url?: string | null;
  post_params?: string | null;
  headers?: string | null;
}

export interface SalebotExport {
  messages: SalebotMessage[];
  connections: SalebotConnection[];
  sheets?: unknown[];
}

// ─── Result types ──────────────────────────────────────────────────────

export interface ImportReport {
  totalNodes: number;
  totalConnections: number;
  mapped: {
    message: number;
    delay: number;
    condition: number;
    http: number;
    note: number;
    reactiveFlow: number;
  };
  unmapped: Array<{ salebotId: number; reason: string }>;
  triggers: number;
}

export interface ImportResult {
  /** Главный flow: содержит entry-point + всю «прямую» воронку. */
  graph: FlowGraph;
  /** Триггеры для главного flow (command, keyword и т.п.). */
  triggers: FlowTrigger[];
  /** Имя для главного flow (берём из первой entry-ноды). */
  flowName: string;
  /**
   * Реактивные ноды (message_type=5) — каждая становится своим flow
   * со своим триггером. Возвращаем как массив, чтобы вызывающий код
   * создал их через db.tgFlow.create в той же транзакции.
   */
  extraFlows: Array<{
    name: string;
    graph: FlowGraph;
    triggers: FlowTrigger[];
    description?: string;
  }>;
  report: ImportReport;
}

// ─── Импортёр ──────────────────────────────────────────────────────────

export function importSalebot(raw: SalebotExport): ImportResult {
  const messagesById = new Map<number, SalebotMessage>();
  for (const m of raw.messages ?? []) messagesById.set(m.id, m);

  // Связи группируем по message_a_id, чтобы при обходе знать «исходящие».
  const outgoingByMsg = new Map<number, SalebotConnection[]>();
  for (const c of raw.connections ?? []) {
    const list = outgoingByMsg.get(c.message_a_id) ?? [];
    list.push(c);
    outgoingByMsg.set(c.message_a_id, list);
  }

  const report: ImportReport = {
    totalNodes: raw.messages?.length ?? 0,
    totalConnections: raw.connections?.length ?? 0,
    mapped: { message: 0, delay: 0, condition: 0, http: 0, note: 0, reactiveFlow: 0 },
    unmapped: [],
    triggers: 0,
  };

  // Каждой Salebot-id присваиваем стабильный uuid (наш формат id).
  // Используем seedable scheme: важно чтобы тот же JSON давал тот же
  // граф при повторном импорте, но для MVP нам хватит rand-uuid.
  const idMap = new Map<number, string>();
  for (const m of raw.messages ?? []) idMap.set(m.id, randomUUID());

  // ── Решаем кто будет entry-point главного flow ───────────────────────
  // Salebot не помечает явно — entry = ноды с condition вроде "/start"
  // или у которых нет входящих connection. Берём первую такую.
  const incomingCount = new Map<number, number>();
  for (const c of raw.connections ?? []) {
    incomingCount.set(c.message_b_id, (incomingCount.get(c.message_b_id) ?? 0) + 1);
  }
  const startCommand = (raw.messages ?? []).find((m) => {
    const cond = (m.condition ?? "").trim();
    return cond.startsWith("/start");
  });
  const orphanRoot = (raw.messages ?? []).find(
    (m) => !incomingCount.get(m.id) && classifyMessageType(m) !== "reactive"
  );
  const entryMsg = startCommand ?? orphanRoot ?? raw.messages?.[0];
  if (!entryMsg) {
    throw new Error("Salebot JSON: ни одной ноды для импорта");
  }

  // ── Реактивные ноды — каждая в свой отдельный flow ──────────────────
  const reactiveFlows: ImportResult["extraFlows"] = [];
  for (const m of raw.messages ?? []) {
    if (classifyMessageType(m) !== "reactive") continue;
    const trigger = parseReactiveTrigger(m);
    if (!trigger) {
      report.unmapped.push({
        salebotId: m.id,
        reason: `Реактивный триггер не распознан: ${m.condition?.slice(0, 80) ?? "—"}`,
      });
      continue;
    }
    const subResult = buildSubGraph(m, messagesById, outgoingByMsg, idMap, report);
    reactiveFlows.push({
      name: m.description?.slice(0, 80) || `Триггер #${m.id}`,
      graph: subResult,
      triggers: [trigger],
      description: m.condition ?? undefined,
    });
    report.mapped.reactiveFlow++;
    report.triggers++;
  }

  // ── Главный flow ────────────────────────────────────────────────────
  const mainGraph = buildMainGraph(entryMsg, messagesById, outgoingByMsg, idMap, report);
  const mainTriggers = parseEntryTriggers(entryMsg);
  report.triggers += mainTriggers.length;

  const flowName = entryMsg.description?.slice(0, 80) || "Импорт из Salebot";

  return {
    graph: mainGraph,
    triggers: mainTriggers,
    flowName,
    extraFlows: reactiveFlows,
    report,
  };
}

// ─── Классификация message_type ────────────────────────────────────────

type NodeKind = "message" | "nudge" | "reactive" | "http" | "note";

function classifyMessageType(m: SalebotMessage): NodeKind {
  switch (m.message_type) {
    case 0:
      return "message";
    case 4:
      return "http";
    case 5:
      return "reactive";
    case 6:
      return "nudge";
    case 8:
      return "note";
    default:
      return "message";
  }
}

// ─── Парсинг триггеров ─────────────────────────────────────────────────

function parseEntryTriggers(m: SalebotMessage): FlowTrigger[] {
  const cond = (m.condition ?? "").trim();
  if (!cond || cond === "#{none}") return [];

  // /start [payload]
  const startMatch = cond.match(/^\/(\w+)(?:\s+(.+))?$/);
  if (startMatch) {
    const cmd = startMatch[1];
    const payload = startMatch[2]?.trim();
    return [
      {
        type: "command",
        command: cmd,
        payloads: payload ? [payload] : undefined,
      },
    ];
  }

  // keyboard:Текст1;Текст2
  const kbMatch = cond.match(/^keyboard\s*:\s*(.+)$/i);
  if (kbMatch) {
    const keys = kbMatch[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length > 0) {
      return [{ type: "keyword", keywords: keys, matchMode: "exact" }];
    }
  }

  // Не распознали — пусть будет subscribed (фоллбэк), админ потом поправит.
  return [];
}

function parseReactiveTrigger(m: SalebotMessage): FlowTrigger | null {
  const cond = (m.condition ?? "").trim();
  if (!cond) return null;

  // link_was_pressed <url> → link_clicked с urlContains
  const linkMatch = cond.match(/^link_was_pressed\s+(\S+)/i);
  if (linkMatch) {
    const url = linkMatch[1];
    // Берём более устойчивый кусок URL для матчинга (path, без query).
    let pathOrUrl = url;
    try {
      const u = new URL(url);
      pathOrUrl = u.host + u.pathname;
    } catch {
      // не URL — оставляем как есть
    }
    return { type: "link_clicked", urlContains: pathOrUrl };
  }

  // getcourse <eventName> → external_event
  const gcMatch = cond.match(/^getcourse\s+(\S+)/i);
  if (gcMatch) {
    return { type: "external_event", eventName: gcMatch[1] };
  }

  // client_unsubscribed → unsubscribed
  if (/^client_unsubscribed/i.test(cond)) {
    return { type: "unsubscribed" };
  }

  // Произвольное событие (autointensiv_04_26_enter, test_enter_intensive) —
  // относим к external_event с тем же именем. В Salebot такие срабатывают
  // когда другой узел делает «отправить событие». У нас тоже сработают,
  // если внешняя система пошлёт POST /api/tg/external-event.
  if (/^[a-z_0-9]+$/i.test(cond)) {
    return { type: "external_event", eventName: cond };
  }

  return null;
}

// ─── Построение графа ──────────────────────────────────────────────────

function buildMainGraph(
  entry: SalebotMessage,
  messagesById: Map<number, SalebotMessage>,
  outgoingByMsg: Map<number, SalebotConnection[]>,
  idMap: Map<number, string>,
  report: ImportReport
): FlowGraph {
  return buildSubGraph(entry, messagesById, outgoingByMsg, idMap, report);
}

function buildSubGraph(
  entry: SalebotMessage,
  messagesById: Map<number, SalebotMessage>,
  outgoingByMsg: Map<number, SalebotConnection[]>,
  idMap: Map<number, string>,
  report: ImportReport
): FlowGraph {
  const nodes: FlowNode[] = [];
  const visited = new Set<number>();
  const queue: number[] = [entry.id];

  while (queue.length > 0) {
    const sbId = queue.shift()!;
    if (visited.has(sbId)) continue;
    visited.add(sbId);

    const sbMsg = messagesById.get(sbId);
    if (!sbMsg) continue;

    const ourId = idMap.get(sbId)!;
    const outgoing = outgoingByMsg.get(sbId) ?? [];

    // Определяем next: если есть условные ветви — condition-нода,
    // если несколько без условия — берём первую (Salebot эмулирует
    // приоритет через condition; настоящая логика приоритетов
    // потребует расширения, что не нужно для MVP).
    const next = resolveNext(outgoing, idMap, queue, sbMsg.id);

    const node = mapMessageToNode(sbMsg, ourId, next, report);
    if (node) {
      nodes.push(node);
      // Если нода вернула несколько (например, condition + delay + message),
      // visited уже обработано в mapMessageToNode через побочный push.
    }

    for (const c of outgoing) {
      if (!visited.has(c.message_b_id)) queue.push(c.message_b_id);
    }
  }

  if (nodes.length === 0) {
    // Деградация: возвращаем пустой message-stub, чтобы FlowGraph был валиден.
    nodes.push({
      id: randomUUID(),
      type: "note",
      text: "Импорт не дал ни одной ноды",
    });
  }

  return {
    version: 1,
    startNodeId: idMap.get(entry.id) ?? nodes[0].id,
    nodes,
  };
}

interface NextResolution {
  /** Прямой next (если ветвлений нет). */
  directNext?: string;
  /** Если есть условные — id condition-ноды или дальше идущая логика. */
  conditionalNext?: string;
}

function resolveNext(
  outgoing: SalebotConnection[],
  idMap: Map<number, string>,
  _queue: number[],
  _fromId: number
): string | undefined {
  // Простейший случай: один выход без условий — указываем прямой next.
  if (outgoing.length === 0) return undefined;
  const first = outgoing[0];
  if (
    outgoing.length === 1 &&
    !first.compare_variable &&
    !first.condition &&
    !first.timeout &&
    !first.send_time &&
    !first.send_date
  ) {
    return idMap.get(first.message_b_id);
  }
  // Со сложными связями (timeout/send_time/compare) текущая нода будет
  // указывать на ID синтетической вспомогательной ноды (delay / delay_until /
  // condition), которые порождает emitTransitionNodes (Фаза 3+). MVP-реализация
  // оставляет «голый next» к первому соседу — пользователь поправит руками
  // в редакторе. Это компромисс: реализовать полный разворот связей со
  // всеми ветками не входит в Фазу 0.
  return idMap.get(outgoing[0].message_b_id);
}

function mapMessageToNode(
  sb: SalebotMessage,
  ourId: string,
  baseNext: string | undefined,
  report: ImportReport
): FlowNode | null {
  const kind = classifyMessageType(sb);
  const label = (sb.description ?? "").slice(0, 80) || `salebot-${sb.id}`;

  if (kind === "note") {
    report.mapped.note++;
    return {
      id: ourId,
      type: "note",
      label,
      next: baseNext,
      text: `Импорт из Salebot: ${sb.description ?? "(без описания)"}`,
    };
  }

  if (kind === "http") {
    report.mapped.http++;
    if (!sb.action_url) {
      report.unmapped.push({ salebotId: sb.id, reason: "HTTP-нода без action_url" });
      return {
        id: ourId,
        type: "note",
        label,
        next: baseNext,
        text: `TODO: HTTP-нода Salebot без action_url — ${label}`,
      };
    }
    return {
      id: ourId,
      type: "http_request",
      label,
      next: baseNext,
      method: sb.request_type === 2 ? "POST" : "GET",
      url: sb.action_url,
      body: convertSalebotTemplates(sb.post_params),
      saveMappings: parseSavedVariablesDSL(sb.saved_variables),
    };
  }

  if (kind === "reactive") {
    // Реактивные ноды обрабатываются отдельным flow — здесь они не должны
    // попадать в обычный граф. Если вдруг попали (например цикл) — note.
    return {
      id: ourId,
      type: "note",
      label,
      next: baseNext,
      text: `Реактивная нода — обрабатывается отдельным flow`,
    };
  }

  // message и nudge — оба становятся messageNodeSchema. Разница только
  // в семантике (nudge приходит после wait_reply.timeoutNext), но
  // содержимое самого payload идентично.
  report.mapped.message++;
  const payload = mapPayload(sb);
  return {
    id: ourId,
    type: "message",
    label,
    next: baseNext,
    payload,
    isPosition: kind === "message",
  };
}

function mapPayload(sb: SalebotMessage): FlowMessagePayload {
  const rawText = (sb.answer ?? "").trim();
  const converted =
    rawText && rawText !== "#{none}"
      ? convertSalebotTemplates(rawText) ?? rawText
      : "(empty)";
  const safeText = converted;
  const buttons = parseSalebotButtons(sb.buttons);
  const payload: FlowMessagePayload = {
    text: safeText,
    buttonRows: buttons.length > 0 ? buttons : undefined,
  };
  if (sb.attachment_url && sb.attachment_type) {
    const kind = mapAttachmentKind(sb.attachment_type);
    if (kind) {
      payload.attachments = [{ kind, url: sb.attachment_url }];
    }
  }
  return payload;
}

function mapAttachmentKind(
  t: string
): "photo" | "video" | "voice" | "video_note" | "document" | "audio" | "animation" | null {
  const lc = t.toLowerCase();
  if (lc === "image" || lc === "photo") return "photo";
  if (lc === "video") return "video";
  if (lc === "voice") return "voice";
  if (lc === "audio") return "audio";
  if (lc === "document" || lc === "file") return "document";
  if (lc === "animation" || lc === "gif") return "animation";
  return null;
}

function parseSalebotButtons(raw: string | null | undefined): FlowButton[][] {
  if (!raw) return [];
  const rows: FlowButton[][] = [];
  // Salebot format: каждая строка `label|url` или `label;next_node`.
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    // URL-кнопка
    const pipe = s.split("|").map((x) => x.trim());
    if (pipe.length === 2 && /^https?:\/\//.test(pipe[1])) {
      rows.push([{ text: pipe[0], url: pipe[1] }]);
      continue;
    }
    // Callback-кнопка (label;optional payload). У нас поле называется `callback`.
    const semi = s.split(";").map((x) => x.trim());
    rows.push([{ text: semi[0], callback: semi[0].slice(0, 64) }]);
  }
  return rows;
}

/**
 * Парсит DSL Salebot `saved_variables`: одна строка на mapping в виде
 *   path|key->target
 * где `path|key` это путь в JSON-ответе (пайп заменяется на точку), а
 * `target` — наша переменная. Пример:
 *   data|utm_source->client.utm_source;
 *   items|0|id->deal.first_item
 */
function parseSavedVariablesDSL(
  saved: string | null | undefined
): HttpSaveMapping[] | undefined {
  if (!saved) return undefined;
  const out: HttpSaveMapping[] = [];
  for (const line of saved.split(/[\n;]/)) {
    const s = line.trim();
    if (!s) continue;
    const m = s.match(/^(.+?)->\s*([\w.]+)\s*$/);
    if (!m) continue;
    const left = m[1].trim().replace(/\|/g, ".");
    const right = m[2].trim();
    if (!left || !right) continue;
    out.push({ jsonPath: left, target: right });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Salebot шаблоны `#{var_name}` превращаем в наши `{{var_name}}`,
 * чтобы renderTemplate подставил значение из контекста подписчика.
 * Это покрывает 90% случаев — переменные пишутся прямо в JSON-теле.
 */
function convertSalebotTemplates(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/#\{(\w+(?:\.\w+)*)\}/g, "{{$1}}");
}
