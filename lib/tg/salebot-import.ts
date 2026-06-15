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
  // Каждая salebot-message превращается в нашу ноду; связи разворачиваются
  // в bridge-узлы для timeout/send_time/send_date/compare_variable.
  // Это даёт 100% связность графа (никаких «недостижимых нод»).
  const allNodes: FlowNode[] = [];
  const bridges: FlowNode[] = [];
  for (const sb of raw.messages ?? []) {
    const ourId = idMap.get(sb.id)!;
    const outgoing = outgoingByMsg.get(sb.id) ?? [];
    const effectiveNext = buildExitForConnections(
      outgoing,
      idMap,
      bridges,
      report
    );
    const node = mapMessageToNode(sb, ourId, effectiveNext, report);
    if (node) allNodes.push(node);
  }
  allNodes.push(...bridges);

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

  // Сохраняем координаты Salebot canvas в graph.positions, чтобы
  // редактор открыл воронку в той же расстановке (а не схлопнул в
  // вертикальную колонку через auto-layout). Нормализуем минимум в 0
  // и оставляем относительные расстояния как в Salebot.
  const positions: Record<string, { x: number; y: number }> = {};
  let minX = Infinity;
  let minY = Infinity;
  for (const m of raw.messages ?? []) {
    if (typeof m.x === "number") minX = Math.min(minX, m.x);
    if (typeof m.y === "number") minY = Math.min(minY, m.y);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  for (const m of raw.messages ?? []) {
    const id = idMap.get(m.id);
    if (!id) continue;
    positions[id] = {
      x: (typeof m.x === "number" ? m.x : 0) - minX,
      y: (typeof m.y === "number" ? m.y : 0) - minY,
    };
  }
  // Bridge-узлы (delay / delay_until / condition) кладём рядом с source-
  // нодой по вертикали — между source и target. Для простоты — посередине
  // вертикально, чуть смещаем по x.
  for (const sb of raw.messages ?? []) {
    const outgoing = outgoingByMsg.get(sb.id) ?? [];
    if (outgoing.length === 0) continue;
    const target = messagesById.get(outgoing[0].message_b_id);
    if (!target) continue;
    const sourceUuid = idMap.get(sb.id);
    if (!sourceUuid) continue;
    const sourcePos = positions[sourceUuid];
    const targetPos =
      idMap.get(target.id) && positions[idMap.get(target.id)!];
    if (!sourcePos || !targetPos) continue;
    const midX = Math.round((sourcePos.x + targetPos.x) / 2);
    const midY = Math.round((sourcePos.y + targetPos.y) / 2);
    // Найдём в bridges те, что появились между этим source и любым из его outgoing.
    // Дешёвая эвристика: совмещаем bridges, ссылающиеся на любого из target'ов
    // ноды source, и расставляем их с равномерным смещением по x.
    const sourceTargets = new Set(
      outgoing.map((c) => idMap.get(c.message_b_id)).filter(Boolean) as string[]
    );
    const relatedBridges = bridges.filter(
      (b) =>
        (b as { next?: string }).next &&
        sourceTargets.has((b as { next?: string }).next!)
    );
    relatedBridges.forEach((b, i) => {
      if (positions[b.id]) return; // уже расставлен
      positions[b.id] = {
        x: midX + (i - (relatedBridges.length - 1) / 2) * 60,
        y: midY,
      };
    });
  }
  // Виртуальный trigger-узел — над entry-нодой.
  const entryPos = positions[idMap.get(entryMsg.id)!];
  if (entryPos) {
    positions["__trigger"] = { x: entryPos.x, y: Math.max(0, entryPos.y - 200) };
  }
  // Фоллбэк-расстановка для оставшихся нод без позиции (например,
  // condition-bridges чьи источники не имеют разрешённых outgoing).
  // Кладём их колонкой справа от основного канваса.
  const maxX = Math.max(0, ...Object.values(positions).map((p) => p.x));
  let fallbackY = 0;
  for (const n of allNodes) {
    if (positions[n.id]) continue;
    positions[n.id] = { x: maxX + 400, y: fallbackY };
    fallbackY += 160;
  }

  const graph: FlowGraph = {
    version: 1,
    startNodeId: idMap.get(entryMsg.id)!,
    nodes: allNodes,
    positions,
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
  // Salebot полиморфен: на любом message_type может быть action_url —
  // это HTTP-выгрузка (типично — Google Sheets, GetCourse, любой webhook).
  // Если url задан, мы должны импортировать ноду как http_request,
  // независимо от типа. Иначе получаются пустые "(empty) message"-ноды,
  // как у пользователя на скриншоте с 18 нодами «Выгрузка».
  if (m.action_url && m.action_url.trim().length > 0) {
    return "http";
  }
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

/**
 * Из массива salebot-connection строит: либо прямую ссылку (если у ноды
 * единственный безусловный выход), либо цепочку синтетических узлов и
 * возвращает id первого в цепочке.
 *
 * Синтетика:
 *   • timeout=N или random(a,b)  → delay
 *   • timeout=N с send_time/date → delay_until
 *   • compare_variable           → condition с rules
 *   • несколько выходов          → condition с rules (last = always-default)
 *
 * Сгенерированные узлы попадают в `bridges` — вызывающий потом мержит
 * их с основным массивом allNodes.
 */
function buildExitForConnections(
  outgoing: SalebotConnection[],
  idMap: Map<number, string>,
  bridges: FlowNode[],
  report: ImportReport
): string | undefined {
  if (outgoing.length === 0) return undefined;

  // Один выход — без condition, прямая (или одна bridge).
  if (outgoing.length === 1) {
    const c = outgoing[0];
    const targetId = idMap.get(c.message_b_id);
    if (!targetId) return undefined;
    return wrapWithBridge(c, targetId, bridges, report);
  }

  // Несколько выходов — разделяем на условные (compare_variable) и
  // безусловные. Условные становятся rule'ами condition-ноды;
  // первая безусловная — defaultNext. Если у Salebot был fan-out
  // (несколько безусловных к разным таргетам) — берём первый
  // (в LMS нет параллельной семантики), остальные логируем как
  // unmapped, чтобы админ увидел в отчёте.
  const conditional = outgoing.filter((c) =>
    (c.compare_variable ?? "").trim()
  );
  const unconditional = outgoing.filter((c) =>
    !(c.compare_variable ?? "").trim()
  );

  // Только безусловные. Один выход → прямая связь. Несколько → split-нода
  // с равными весами на каждую ветку: визуально граф связан и валидатор
  // считает все ветки достижимыми. Семантически Salebot выполнял ветки
  // параллельно, у нас split выберет одну случайную — пользователю
  // придётся переделать вручную, но как минимум он увидит все ветки.
  if (conditional.length === 0) {
    if (unconditional.length === 1) {
      const c = unconditional[0];
      const targetId = idMap.get(c.message_b_id);
      if (!targetId) return undefined;
      return wrapWithBridge(c, targetId, bridges, report);
    }
    report.unmapped.push({
      salebotId: unconditional[0].message_a_id,
      reason: `Fan-out из ${unconditional.length} веток (Salebot выполнял параллельно) импортирован как A/B split — выбор одной случайной. Переделайте вручную если нужна параллельность.`,
    });
    const branches: Array<{ label: string; weight: number; next?: string }> = [];
    for (let i = 0; i < unconditional.length; i++) {
      const c = unconditional[i];
      const targetId = idMap.get(c.message_b_id);
      if (!targetId) continue;
      const next = wrapWithBridge(c, targetId, bridges, report);
      branches.push({ label: `Ветка ${i + 1}`, weight: 1, next });
    }
    if (branches.length < 2) {
      // Едва ли возможно после фильтров, но fallback — прямая связь.
      return branches[0]?.next;
    }
    const splitId = randomUUID();
    bridges.push({
      id: splitId,
      type: "split",
      label: `Fan-out (${branches.length})`,
      branches: branches as Array<{ label: string; weight: number; next: string }>,
    });
    return splitId;
  }

  // Есть условные → condition.
  const rules: Array<{
    kind: "tag" | "variable" | "expr" | "always";
    params: Record<string, unknown>;
    next: string;
  }> = [];
  for (const c of conditional) {
    const targetId = idMap.get(c.message_b_id);
    if (!targetId) continue;
    const stepNext = wrapWithBridge(c, targetId, bridges, report);
    rules.push({
      kind: "expr",
      params: { expr: salebotConditionToExpr(c.compare_variable!.trim()) },
      next: stepNext,
    });
  }
  let defaultNext: string | undefined;
  if (unconditional.length > 0) {
    const c = unconditional[0];
    const targetId = idMap.get(c.message_b_id);
    if (targetId) defaultNext = wrapWithBridge(c, targetId, bridges, report);
    if (unconditional.length > 1) {
      report.unmapped.push({
        salebotId: c.message_a_id,
        reason: `Fan-out из ${unconditional.length} безусловных веток рядом с condition — импортирована только первая как default`,
      });
    }
  }
  if (rules.length === 0) {
    return defaultNext;
  }
  const condId = randomUUID();
  bridges.push({
    id: condId,
    type: "condition",
    label: "Switch (Salebot)",
    rules,
    defaultNext,
  });
  report.mapped.condition++;
  return condId;
}

/**
 * Оборачивает одну connection (с её timeout/send_time/send_date) в
 * цепочку bridge-узлов и возвращает id первого узла цепочки. Если ничего
 * оборачивать не надо — возвращает targetId как есть.
 */
function wrapWithBridge(
  c: SalebotConnection,
  targetId: string,
  bridges: FlowNode[],
  report: ImportReport
): string {
  const sendTime = (c.send_time ?? "").trim();
  const sendDate = (c.send_date ?? "").trim();
  const timeoutRaw = (c.timeout ?? "").trim();

  // send_time — приоритетней timeout: «отправить в 11:00 МСК».
  if (sendTime) {
    const { time, daysOffset } = parseSendTimeAndDate(sendTime, sendDate);
    const id = randomUUID();
    bridges.push({
      id,
      type: "delay_until",
      label: `→ ${sendTime}${sendDate ? ` ${sendDate}` : ""}`,
      next: targetId,
      time,
      daysOffset,
    });
    report.mapped.delay++;
    return id;
  }

  // timeout — обычная задержка. Поддерживаем "N" и "random(a,b)".
  if (timeoutRaw && timeoutRaw !== "0") {
    const { seconds, secondsMax } = parseSalebotTimeout(timeoutRaw);
    if (seconds > 0) {
      const id = randomUUID();
      bridges.push({
        id,
        type: "delay",
        label:
          secondsMax && secondsMax > seconds
            ? `delay random ${seconds}..${secondsMax}s`
            : `delay ${seconds}s`,
        next: targetId,
        seconds,
        secondsMax: secondsMax && secondsMax > seconds ? secondsMax : undefined,
      });
      report.mapped.delay++;
      return id;
    }
  }

  return targetId;
}

/**
 * Парсит "N" или "random(a,b)" в seconds/secondsMax. Если не распарсилось —
 * возвращает {seconds: 0}.
 */
function parseSalebotTimeout(raw: string): { seconds: number; secondsMax?: number } {
  const rand = raw.match(/^random\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rand) {
    const a = parseInt(rand[1], 10);
    const b = parseInt(rand[2], 10);
    return { seconds: Math.min(a, b), secondsMax: Math.max(a, b) };
  }
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return { seconds: n };
  return { seconds: 0 };
}

/**
 * Salebot send_time приходит как "11:00 МСК" или "20:00", send_date —
 * либо абсолютная дата "2026-05-21", либо относительное смещение в
 * sales-формате. Здесь делаем простой парсинг: время = HH:MM,
 * daysOffset = 0 (ближайшее будущее).
 */
function parseSendTimeAndDate(
  sendTime: string,
  _sendDate: string
): { time: string; daysOffset: number } {
  const m = sendTime.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return { time, daysOffset: 0 };
  }
  return { time: "11:00", daysOffset: 0 };
}

/**
 * Salebot compare_variable пишется почти как JS, мы можем прокинуть как
 * есть в наш expression engine. Делаем минимальные подмены:
 *   "x != 1"           → "x != 1"
 *   "tg_track == 1"    → "tg_track == 1"
 *   "client_type == 20 and tg_track == 1" → "client_type == 20 && tg_track == 1"
 */
function salebotConditionToExpr(raw: string): string {
  return raw
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .trim();
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
    // Salebot request_type: 1=GET, 2=POST (по факту в экспортах). Если
    // есть post_params — это всегда POST/PUT/PATCH с телом, дефолтим
    // в POST. Если url задан, post_params пуст и request_type=1 — GET.
    const hasBody = !!(sb.post_params && sb.post_params.trim().length > 0);
    const method = sb.request_type === 1 && !hasBody ? "GET" : "POST";
    const httpLabel =
      label ||
      (sb.action_url.includes("gsheets") ? "Выгрузка → Google Sheets" : "HTTP-вызов");
    const body = hasBody ? convertSalebotTemplates(sb.post_params) : undefined;
    return {
      id: ourId,
      type: "http_request",
      label: httpLabel,
      next: baseNext,
      method,
      url: convertSalebotTemplates(sb.action_url) ?? sb.action_url,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
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
