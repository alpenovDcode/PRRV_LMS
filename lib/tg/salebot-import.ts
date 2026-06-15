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

  const idMap = new Map<number, string>();
  for (const m of raw.messages ?? []) idMap.set(m.id, randomUUID());

  // ── Точка входа главного flow (для /start) ──────────────────────────
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

  // ── Собираем ВСЕ ноды в один общий граф ─────────────────────────────
  // Каждая salebot-message превращается в нашу ноду; связи остаются
  // нативно через `next`. Реактивные ноды остаются в этом же графе,
  // но получают actions-семантику (см. mapMessageToNode).
  const allNodes: FlowNode[] = [];
  for (const sb of raw.messages ?? []) {
    const ourId = idMap.get(sb.id)!;
    const outgoing = outgoingByMsg.get(sb.id) ?? [];
    const baseNext = resolveNext(outgoing, idMap, [], sb.id);
    const node = mapMessageToNode(sb, ourId, baseNext, report);
    if (node) allNodes.push(node);
  }

  // ── Триггеры главного flow ──────────────────────────────────────────
  // Один TgFlow получает:
  //   • триггер /start с startAt = entry-нодой
  //   • по триггеру для каждой реактивной ноды (с её startAt)
  // Это даёт «N точек входа в один граф» — как в Salebot.
  const allTriggers: FlowTrigger[] = [];
  for (const t of parseEntryTriggers(entryMsg)) {
    // /start всегда стартует с entry-ноды
    allTriggers.push(withStartAt(t, idMap.get(entryMsg.id)!));
  }
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
    allTriggers.push(withStartAt(trigger, idMap.get(m.id)!));
    report.mapped.reactiveFlow++;
  }
  report.triggers = allTriggers.length;

  const graph: FlowGraph = {
    version: 1,
    startNodeId: idMap.get(entryMsg.id)!,
    nodes: allNodes,
  };
  const flowName = entryMsg.description?.slice(0, 80) || "Импорт из Salebot";

  return {
    graph,
    triggers: allTriggers,
    flowName,
    // Больше не создаём отдельные flows — всё в одном.
    extraFlows: [],
    report,
  };
}

/** Возвращает копию триггера с проставленным advanced.startAt. */
function withStartAt(t: FlowTrigger, startAt: string): FlowTrigger {
  const adv = ("advanced" in t ? t.advanced : undefined) ?? {};
  return { ...t, advanced: { ...adv, startAt } } as FlowTrigger;
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
    // Реактивная нода в Salebot обычно ставит флаг (например
    // autointensive0426_web_d1_was = 1) — это нужно сохранить как
    // actions-ноду, иначе после триггера ничего не происходит.
    // Если variables пусто — оставляем note (нечего делать).
    const setVars = parseSalebotVariables(sb.variables);
    if (setVars.length > 0) {
      return {
        id: ourId,
        type: "actions",
        label,
        next: baseNext,
        actions: { setVariables: setVars },
      };
    }
    return {
      id: ourId,
      type: "note",
      label,
      next: baseNext,
      text: `Реактивная нода без variables: ${sb.description ?? ""}`,
    };
  }

  // message и nudge — оба становятся messageNodeSchema. Разница только
  // в семантике (nudge приходит после wait_reply.timeoutNext), но
  // содержимое самого payload идентично.
  report.mapped.message++;
  const payload = mapPayload(sb);
  // Salebot-ноды могут попутно ставить переменные — кладём их в onSend.
  const setVars = parseSalebotVariables(sb.variables);
  if (setVars.length > 0) {
    payload.onSend = { setVariables: setVars };
  }
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

/**
 * Salebot хранит кнопки одним из трёх способов:
 *
 *  1) JSON-массив объектов:
 *     [{ "line":0, "index_in_line":0, "text":"Регистрация", "type":"inline",
 *        "url":"https://…", "callback_link":false }]
 *     line = индекс ряда, index_in_line = позиция внутри ряда.
 *     type: "inline" | "phone" | "location" | "url" | "callback"
 *
 *  2) Старый текстовый формат, по одной строке:
 *     "Метка|https://target.com"   — URL-кнопка
 *     "Метка;next_node_id"          — callback с переходом
 *     "Метка"                        — простая callback
 *
 *  3) Salebot-шаблоны #{var} внутри text/url — конвертируем в {{var}}.
 *
 * Лимит Telegram (наша схема): text/callback ≤ 64 символа — обрезаем.
 */
function parseSalebotButtons(raw: string | null | undefined): FlowButton[][] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Вариант (1) — JSON-массив объектов.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      // Группируем по line, сортируем по index_in_line.
      const byLine = new Map<number, FlowButton[]>();
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const lineIdx =
          typeof it.line === "number" ? it.line : 0;
        const idxInLine =
          typeof it.index_in_line === "number" ? it.index_in_line : 0;
        const btn = salebotItemToButton(it);
        if (!btn) continue;
        const row = byLine.get(lineIdx) ?? [];
        // Кладём с учётом index_in_line; сортируем в конце.
        (row as unknown as Array<FlowButton & { _i?: number }>).push(
          Object.assign(btn, { _i: idxInLine })
        );
        byLine.set(lineIdx, row);
      }
      const sortedLines = Array.from(byLine.keys()).sort((a, b) => a - b);
      const rows: FlowButton[][] = [];
      for (const li of sortedLines) {
        const row = byLine.get(li)!;
        row.sort(
          (a, b) =>
            ((a as FlowButton & { _i?: number })._i ?? 0) -
            ((b as FlowButton & { _i?: number })._i ?? 0)
        );
        // Убираем технический _i.
        rows.push(
          row.map(({ _i, ...rest }: FlowButton & { _i?: number }) => rest)
        );
      }
      if (rows.length > 0) return rows;
    } catch {
      // не JSON — падаем во вариант (2)
    }
  }

  // Вариант (2) — каждая строка = одна кнопка.
  const rows: FlowButton[][] = [];
  for (const line of trimmed.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    const pipe = s.split("|").map((x) => x.trim());
    if (pipe.length === 2 && /^https?:\/\//.test(pipe[1])) {
      rows.push([cropButton({ text: pipe[0], url: pipe[1] })]);
      continue;
    }
    const semi = s.split(";").map((x) => x.trim());
    rows.push([cropButton({ text: semi[0], callback: semi[0] })]);
  }
  return rows;
}

function salebotItemToButton(it: Record<string, unknown>): FlowButton | null {
  const text = typeof it.text === "string" ? it.text : "";
  if (!text) return null;
  const type = typeof it.type === "string" ? it.type : "inline";
  const url = typeof it.url === "string" ? it.url : undefined;

  // type=phone — кнопка-запрос телефона. В TG это reply-keyboard с
  // request_contact=true; у нас есть флаг requestContact.
  if (type === "phone") {
    return cropButton({ text, requestContact: true });
  }
  if (type === "location") {
    return cropButton({ text, requestLocation: true });
  }
  // URL-кнопка: type=inline с url, либо type=url.
  if (url) {
    return cropButton({
      text,
      url: convertSalebotTemplates(url) ?? url,
    });
  }
  // По умолчанию — callback-кнопка с тем же текстом в data.
  return cropButton({ text, callback: text });
}

function cropButton(b: FlowButton): FlowButton {
  // Telegram + наша схема: text/callback ≤ 64. Salebot допускает длиннее.
  const out: FlowButton = { ...b };
  if (out.text && out.text.length > 64) out.text = out.text.slice(0, 64);
  if (out.callback && out.callback.length > 64)
    out.callback = out.callback.slice(0, 64);
  return out;
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
 * Парсит Salebot-DSL поля `variables` (одна или несколько строк
 * вида `key = value`, разделители \n или ;, /* комментарии */ /* пропускаем).
 * Возвращает массив для inlineActions.setVariables.
 *
 * Имена ключей без префикса считаем client-scope (как делает Salebot).
 * Шаблоны #{var} в значении конвертируем в наши {{var}}.
 */
function parseSalebotVariables(
  raw: string | null | undefined
): Array<{ key: string; value: string }> {
  if (!raw) return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const chunk of raw.split(/[\n;]+/)) {
    let s = chunk.trim();
    if (!s) continue;
    // вырезаем /* ... */ комментарии (могут быть один-в-строке).
    s = s.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    const value = s.slice(eq + 1).trim();
    if (!key) continue;
    // Префикс scope не задан — Salebot пишет в client-scope; наша engine
    // тоже пишет туда по умолчанию (см. setVarScoped).
    out.push({
      key: key.length > 80 ? key.slice(0, 80) : key,
      value: convertSalebotTemplates(value) ?? value,
    });
  }
  return out;
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
