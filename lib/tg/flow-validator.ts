// Семантическая валидация флоу — то, что Zod-схема не ловит.
//
// Zod проверяет только структуру: типы полей, дискриминированные юнионы,
// длины массивов. Он НЕ замечает логические дыры:
//   • message без `next` и без end-преемника — диалог обрывается
//   • wait_reply без timeoutNext и без timeoutAt — пользователь застрял
//   • condition с правилами, но без defaultNext — «иначе» провалится молча
//   • split с дублирующимися label’ами ветвей — _abVariant перезатрётся
//   • http_request без onError — 500-ка от внешнего API повесит ран
//   • кнопка contact/location в inline-клавиатуре (Telegram игнорирует)
//   • триггеров пусто — флоу никогда не запустится сам
//
// Валидатор НЕ запрещает сохранение — это «warning», а не «error». Жёсткие
// ошибки (битые ссылки на ноды) уже ловит reactFlowToGraph. Здесь мы
// сигналим автору «подумай, точно ли так задумано» через панель в редакторе.

import type { FlowGraph, FlowNode, FlowTrigger } from "./flow-schema";

export type IssueSeverity = "warn" | "error";

export interface FlowIssue {
  severity: IssueSeverity;
  code: string;
  // nodeId null = глобальная проблема (нет триггеров, например)
  nodeId: string | null;
  // Кратко по-русски, шёт админ.
  message: string;
}

// Главная функция. Принимает уже-валидированный по Zod графа + триггеры,
// возвращает массив проблем.
export function validateFlow(
  graph: FlowGraph,
  triggers: FlowTrigger[]
): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const byId = new Map<string, FlowNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  // ---------------------------------------------------------------------
  // 1) Триггеров нет — флоу не запустится сам (его можно дёрнуть только
  //    через goto_flow или вручную через API). Часто это ошибка автора:
  //    забыл добавить /команду или ключевое слово.
  // ---------------------------------------------------------------------
  if (triggers.length === 0) {
    issues.push({
      severity: "warn",
      code: "NO_TRIGGERS",
      nodeId: null,
      message:
        "У флоу нет триггеров. Сам он не запустится — только через goto_flow или Manual Run.",
    });
  }

  // ---------------------------------------------------------------------
  // 2) startNodeId указывает на несуществующую ноду — фатально, но это
  //    как правило ловит уже reactFlowToGraph. Дублируем на всякий.
  // ---------------------------------------------------------------------
  if (graph.startNodeId && !byId.has(graph.startNodeId)) {
    issues.push({
      severity: "error",
      code: "START_NODE_MISSING",
      nodeId: null,
      message: `startNodeId «${graph.startNodeId}» не найден в графе.`,
    });
  }

  // ---------------------------------------------------------------------
  // 3) BFS от старта — найдём ноды, до которых движок реально дойдёт
  //    (нужно для проверки «обрывается ли диалог»: оборванный путь без
  //    end — это потенциально просто конец, и движок отметит run как
  //    completed; OK, но автор может не знать что путь молча обрывается
  //    на середине).
  // ---------------------------------------------------------------------
  const reachable = computeReachable(graph);

  // ---------------------------------------------------------------------
  // 4) По каждой ноде — узко-семантические проверки.
  // ---------------------------------------------------------------------
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      // Unreachable ноды редактор уже подсветил полупрозрачными +
      // отдельный баннер с количеством. Здесь дублируем «формально»,
      // но severity=warn — иногда draft-нода висит специально.
      issues.push({
        severity: "warn",
        code: "UNREACHABLE",
        nodeId: node.id,
        message: "Нода не достижима из триггера — engine её не выполнит.",
      });
      continue;
    }

    switch (node.type) {
      case "message": {
        // message без next и без end в графе → диалог тупо обрывается
        // (run будет помечен completed, но автор может не подразумевал).
        if (!node.next && !hasButtonExit(node)) {
          // Кнопки умеют ветвить через goto:/onClick, но если их нет —
          // и next пуст, и end не подцеплен — это обрыв.
          issues.push({
            severity: "warn",
            code: "MESSAGE_DEAD_END",
            nodeId: node.id,
            message:
              "Сообщение без `next` и без кнопок-переходов — диалог завершится после отправки.",
          });
        }
        // Reply-клавиатура с request_contact/request_location, но
        // keyboardMode не "reply" — Telegram эти флаги в inline просто
        // проигнорирует (молча отдаст обычные кнопки без триггера запроса).
        const kbMode = node.payload?.keyboardMode ?? "inline";
        const buttons = (node.payload?.buttonRows ?? []).flat();
        const hasContactBtn = buttons.some(
          (b: { requestContact?: boolean; requestLocation?: boolean }) =>
            b.requestContact || b.requestLocation
        );
        if (hasContactBtn && kbMode !== "reply") {
          issues.push({
            severity: "warn",
            code: "CONTACT_BUTTON_INLINE",
            nodeId: node.id,
            message:
              "Кнопки запроса контакта/локации работают только в Reply-клавиатуре. Переключите keyboardMode на reply.",
          });
        }
        break;
      }
      case "wait_reply": {
        // wait_reply без timeoutNext И без timeoutAt — пользователь
        // может застрять навсегда (если не пришлёт реплай и не выйдет
        // /start’ом). Допустимо, если ровно это и было задумано — потому warn.
        if (!node.timeoutNext && !node.timeoutSeconds) {
          issues.push({
            severity: "warn",
            code: "WAIT_REPLY_NO_TIMEOUT",
            nodeId: node.id,
            message:
              "wait_reply без timeoutSeconds/timeoutNext — пользователь может застрять до /start.",
          });
        }
        if (!node.next) {
          issues.push({
            severity: "warn",
            code: "WAIT_REPLY_NO_NEXT",
            nodeId: node.id,
            message:
              "wait_reply без `next` — получив ответ, движок не знает куда дальше.",
          });
        }
        break;
      }
      case "condition": {
        if (!node.defaultNext) {
          issues.push({
            severity: "warn",
            code: "CONDITION_NO_DEFAULT",
            nodeId: node.id,
            message:
              "Condition без defaultNext — если ни одно правило не сработало, run завершится молча.",
          });
        }
        // Все правила без next → бессмысленные правила.
        const hasAnyNext =
          node.rules.some((r) => r.next) || !!node.defaultNext;
        if (!hasAnyNext) {
          issues.push({
            severity: "error",
            code: "CONDITION_DEAD",
            nodeId: node.id,
            message:
              "Ни у одного правила condition нет next — нода-тупик, run обрывается.",
          });
        }
        break;
      }
      case "http_request": {
        if (!node.onError) {
          issues.push({
            severity: "warn",
            code: "HTTP_NO_ON_ERROR",
            nodeId: node.id,
            message:
              "HTTP-запрос без onError — при 5xx/timeout run завершится с ошибкой без fallback’а.",
          });
        }
        if (!node.next) {
          issues.push({
            severity: "warn",
            code: "HTTP_NO_NEXT",
            nodeId: node.id,
            message:
              "HTTP-запрос без `next` (ok) — успешный ответ ведёт в никуда.",
          });
        }
        break;
      }
      case "split": {
        // Дубликаты label’ов между ветками — _abVariant перезапишется и
        // аналитика A/B-эксперимента развалится.
        const labels = node.branches.map((b) => b.label);
        const dup = labels.find((l, i) => labels.indexOf(l) !== i);
        if (dup) {
          issues.push({
            severity: "error",
            code: "SPLIT_DUPLICATE_LABELS",
            nodeId: node.id,
            message: `В split-ноде повторяется label «${dup}». Должны быть уникальны — иначе аналитика веток сольётся.`,
          });
        }
        // Ветви без next.
        const orphan = node.branches.filter((b) => !b.next).length;
        if (orphan > 0) {
          issues.push({
            severity: "warn",
            code: "SPLIT_BRANCH_DISCONNECTED",
            nodeId: node.id,
            message: `${orphan} ветка(и) split-ноды не подключены — попавшие в них runs завершатся.`,
          });
        }
        break;
      }
      case "goto_flow": {
        if (!node.flowId) {
          issues.push({
            severity: "error",
            code: "GOTO_NO_FLOW",
            nodeId: node.id,
            message: "goto_flow без выбранного flowId — нода-тупик.",
          });
        }
        break;
      }
      case "actions": {
        // actions с пустым bundle’ом — нет смысла на холсте.
        const a = node.actions ?? {};
        const isEmpty =
          (!a.addTags || a.addTags.length === 0) &&
          (!a.removeTags || a.removeTags.length === 0) &&
          (!a.addToLists || a.addToLists.length === 0) &&
          (!a.removeFromLists || a.removeFromLists.length === 0) &&
          (!a.setVariables || a.setVariables.length === 0);
        if (isEmpty) {
          issues.push({
            severity: "warn",
            code: "ACTIONS_EMPTY",
            nodeId: node.id,
            message:
              "Actions-нода пуста — ничего не сделает. Можно удалить или заполнить.",
          });
        }
        break;
      }
      case "delay": {
        if (!node.next) {
          issues.push({
            severity: "warn",
            code: "DELAY_NO_NEXT",
            nodeId: node.id,
            message:
              "delay без `next` — после ожидания run завершится без действия.",
          });
        }
        break;
      }
    }
  }

  return issues;
}

// Любая ли кнопка сообщения уводит в другой шаг (через callback:goto: или onClick).
function hasButtonExit(node: FlowNode): boolean {
  if (node.type !== "message") return false;
  const buttons = (node.payload?.buttonRows ?? []).flat();
  return buttons.some(
    (b: { callback?: string; onClick?: unknown; url?: string }) =>
      (b.callback && b.callback.startsWith("goto:")) ||
      !!b.onClick ||
      !!b.url // URL-кнопка тоже валидный «выход», диалог не считается обрывом
  );
}

// BFS от startNode. Не путать с reachable от триггерной псевдо-ноды
// в редакторе — здесь логический граф, без UI-узла триггера.
function computeReachable(graph: FlowGraph): Set<string> {
  const visited = new Set<string>();
  if (!graph.startNodeId) return visited;
  const byId = new Map<string, FlowNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  const queue: string[] = [graph.startNodeId];
  visited.add(graph.startNodeId);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = byId.get(id);
    if (!n) continue;
    for (const ref of outgoingRefs(n)) {
      if (ref && byId.has(ref) && !visited.has(ref)) {
        visited.add(ref);
        queue.push(ref);
      }
    }
  }
  return visited;
}

function outgoingRefs(n: FlowNode): Array<string | undefined> {
  switch (n.type) {
    case "message":
    case "delay":
    case "add_tag":
    case "remove_tag":
    case "add_to_list":
    case "remove_from_list":
    case "set_variable":
    case "goto_flow":
    case "note":
    case "actions":
      return [n.next];
    case "wait_reply":
      return [n.next, n.timeoutNext];
    case "http_request":
      return [n.next, n.onError];
    case "condition":
      return [...n.rules.map((r) => r.next), n.defaultNext];
    case "split":
      return n.branches.map((b) => b.next);
    case "end":
      return [];
  }
}
