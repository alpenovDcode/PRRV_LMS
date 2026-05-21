"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  ReactFlowProvider,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  graphToReactFlow,
  reactFlowToGraph,
  TRIGGER_NODE_ID,
  type EditorEdge,
  type EditorNode,
  type SchemaNodeData,
  type TriggerNodeData,
} from "@/lib/tg/flow-editor-converter";
import type {
  FlowGraph,
  FlowNode,
  FlowTrigger,
} from "@/lib/tg/flow-schema";

import { NodePalette, PALETTE_ITEMS } from "./node-palette";
import { PropertiesPanel } from "./properties-panel";
import { MessageNode } from "./nodes/message-node";
import { DelayNode } from "./nodes/delay-node";
import { WaitReplyNode } from "./nodes/wait-reply-node";
import { ConditionNode } from "./nodes/condition-node";
import { AddTagNode, RemoveTagNode } from "./nodes/tag-nodes";
import { SetVariableNode } from "./nodes/set-variable-node";
import { HttpRequestNode } from "./nodes/http-request-node";
import { GotoFlowNode } from "./nodes/goto-flow-node";
import { NoteNode } from "./nodes/note-node";
import { ActionsNode } from "./nodes/actions-node";
import { SplitNode } from "./nodes/split-node";
import { EndNode } from "./nodes/end-node";
import { TriggerNode } from "./nodes/trigger-node";
import { Button } from "@/components/ui/button";
import { Undo2, Redo2, AlertTriangle, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { validateFlow, type FlowIssue } from "@/lib/tg/flow-validator";

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  delay: DelayNode,
  wait_reply: WaitReplyNode,
  condition: ConditionNode,
  add_tag: AddTagNode,
  remove_tag: RemoveTagNode,
  set_variable: SetVariableNode,
  http_request: HttpRequestNode,
  goto_flow: GotoFlowNode,
  note: NoteNode,
  actions: ActionsNode,
  split: SplitNode,
  end: EndNode,
};

interface FlowEditorProps {
  graph: FlowGraph;
  triggers: FlowTrigger[];
  flowList: Array<{ id: string; name: string }>;
  currentFlowId: string;
  onChange: (next: { graph: FlowGraph; triggers: FlowTrigger[]; warnings: string[] }) => void;
}

interface HistoryEntry {
  nodes: EditorNode[];
  edges: EditorEdge[];
}

const HISTORY_LIMIT = 30;

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSchemaNodeFor(type: string, id: string): FlowNode | null {
  switch (type) {
    case "message":
      return {
        id,
        type: "message",
        label: "Сообщение",
        payload: { text: "Привет!" },
      };
    case "delay":
      return { id, type: "delay", label: "Задержка", seconds: 60 };
    case "wait_reply":
      return {
        id,
        type: "wait_reply",
        label: "Жду ответ",
        saveAs: "answer",
        timeoutSeconds: 3600,
      };
    case "condition":
      return {
        id,
        type: "condition",
        label: "Условие",
        rules: [{ kind: "always", params: {}, next: "" }],
      };
    case "add_tag":
      return { id, type: "add_tag", label: "Тег +", tag: "tag1" };
    case "remove_tag":
      return { id, type: "remove_tag", label: "Тег −", tag: "tag1" };
    case "add_to_list":
      return { id, type: "add_to_list", label: "В список", listId: "" };
    case "remove_from_list":
      return { id, type: "remove_from_list", label: "Из списка", listId: "" };
    case "set_variable":
      return { id, type: "set_variable", label: "Переменная", key: "key", value: "" };
    case "http_request":
      return {
        id,
        type: "http_request",
        label: "HTTP",
        method: "GET",
        url: "https://example.com",
      };
    case "goto_flow":
      return { id, type: "goto_flow", label: "Прыжок", flowId: "" };
    case "note":
      return { id, type: "note", label: "Заметка", text: "Описание шага…" };
    case "actions":
      // Standalone action-bundle — rare; usually inline onSend covers it.
      return { id, type: "actions", label: "Действия", actions: {} };
    case "split":
      return {
        id,
        type: "split",
        label: "A/B split",
        branches: [
          { label: "A", weight: 1, next: "" },
          { label: "B", weight: 1, next: "" },
        ],
      };
    case "end":
      return { id, type: "end", label: "Конец" };
    default:
      return null;
  }
}

function FlowEditorInner({
  graph,
  triggers,
  flowList,
  currentFlowId,
  onChange,
}: FlowEditorProps) {
  // Initial load: convert + auto-layout.
  const initial = useMemo(
    () => graphToReactFlow(graph, triggers, { autoLayout: true }),
    // We only want this to compute on the first render of the editor for a
    // given graph identity; subsequent mutations come from React Flow state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Inject flowName lookup data into goto_flow nodes for display.
  const enrich = useCallback(
    (nodes: EditorNode[]): Node[] => {
      return nodes.map((n) => {
        if (n.id === TRIGGER_NODE_ID) {
          return { ...n, data: n.data as unknown as Record<string, unknown> } as unknown as Node;
        }
        const d = n.data as SchemaNodeData;
        const schema = d.schemaNode;
        if (schema && schema.type === "goto_flow") {
          const flowName = flowList.find((f) => f.id === schema.flowId)?.name;
          return {
            ...n,
            data: { ...d, flowName } as unknown as Record<string, unknown>,
          } as unknown as Node;
        }
        return { ...n, data: d as unknown as Record<string, unknown> } as unknown as Node;
      });
    },
    [flowList]
  );

  const decorateEdges = useCallback((eds: EditorEdge[]): Edge[] => {
    return eds.map((e) => {
      const isDashed = e.style === "dashed";
      // Drop our custom string-typed `style` field before spreading so
      // React Flow's runtime sees only the proper CSS object below.
      const { style: _drop, color: _drop2, ...rest } = e;
      void _drop;
      void _drop2;
      return {
        ...rest,
        type: "smoothstep",
        animated: isDashed,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDashed ? "#fbbf24" : "#94a3b8",
        },
        // Tailwind-ish palette: amber for dashed (delays/timeouts),
        // slate for solid (explicit user advances).
        style: isDashed
          ? {
              stroke: "#fbbf24",
              strokeWidth: 1.5,
              strokeDasharray: "6 4",
            }
          : {
              stroke: "#94a3b8",
              strokeWidth: 1.5,
            },
      };
    }) as unknown as Edge[];
  }, []);

  const [nodes, setNodes] = useState<Node[]>(() => enrich(initial.nodes));
  const [edges, setEdges] = useState<Edge[]>(() => decorateEdges(initial.edges));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // BFS over the current graph from the synthetic TRIGGER node. Any
  // schema node not in this set is unreachable — the user added it but
  // didn't wire it in, so the engine will never execute it.
  // We dim such nodes on the canvas and surface a counter in the toolbar,
  // so the author notices dead branches before deploying.
  const reachableIds = useMemo(() => {
    const visited = new Set<string>([TRIGGER_NODE_ID]);
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      const arr = adjacency.get(e.source) ?? [];
      arr.push(e.target);
      adjacency.set(e.source, arr);
    }
    const queue: string[] = [TRIGGER_NODE_ID];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const next of adjacency.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return visited;
  }, [edges]);

  // Apply visual dimming to unreachable nodes. We attach React Flow
  // node.style for opacity + grayscale, plus a flag in data the node
  // component can use to show a small "🚫 не доступна" badge.
  const displayedNodes = useMemo(() => {
    return nodes.map((n) => {
      // End-node and trigger pseudo-node are always reachable from the
      // user's perspective (or irrelevant for this check).
      if (n.id === TRIGGER_NODE_ID || n.type === "end") return n;
      const isReachable = reachableIds.has(n.id);
      if (isReachable) return n;
      return {
        ...n,
        style: {
          ...(n.style ?? {}),
          opacity: 0.4,
          filter: "grayscale(0.7)",
        },
        data: {
          ...(n.data ?? {}),
          _unreachable: true,
        },
      };
    });
  }, [nodes, reachableIds]);

  // Count of unreachable schema nodes (excluding trigger pseudo-node).
  const unreachableCount = useMemo(() => {
    return nodes.filter(
      (n) => n.id !== TRIGGER_NODE_ID && !reachableIds.has(n.id) && n.type !== "end"
    ).length;
  }, [nodes, reachableIds]);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // History for undo/redo.
  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = useCallback(() => {
    const entry: HistoryEntry = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? "",
        position: { ...n.position },
        data: n.data as unknown as SchemaNodeData | TriggerNodeData,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
      })),
    };
    historyRef.current.push(entry);
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    futureRef.current = [];
  }, [nodes, edges]);

  const debouncedSnapshot = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => snapshot(), 500);
  }, [snapshot]);

  // Semantic-issues state — то, что обнаружил validateFlow на последнем
  // propagateChange. Структурные ошибки (битые ref’ы) уже в warnings.
  const [semanticIssues, setSemanticIssues] = useState<FlowIssue[]>([]);

  // Propagate every meaningful change up.
  const propagateChange = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      const editorNodes: EditorNode[] = nextNodes.map((n) => ({
        id: n.id,
        type: n.type ?? "",
        position: n.position,
        data: n.data as unknown as SchemaNodeData | TriggerNodeData,
      }));
      const editorEdges: EditorEdge[] = nextEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: (e.sourceHandle as string | null | undefined) ?? undefined,
      }));
      const result = reactFlowToGraph(editorNodes, editorEdges);
      // Семантическая валидация поверх структурной. validateFlow требует
      // валидный по Zod граф — структурные ошибки уже в result.warnings.
      // Если граф не валидируется (warnings есть про graph: ...), всё
      // равно пробуем — большинство проверок устойчивы к частичным дырам.
      try {
        const issues = validateFlow(result.graph, result.triggers);
        setSemanticIssues(issues);
      } catch {
        setSemanticIssues([]);
      }
      onChange(result);
    },
    [onChange]
  );

  // Push initial state once mounted (so consumer has up-to-date warnings).
  useEffect(() => {
    propagateChange(nodes, edges);
    snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh goto_flow display labels when the flow list resolves.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const d = n.data as { schemaNode?: FlowNode };
        const schema = d.schemaNode;
        if (schema && schema.type === "goto_flow") {
          const flowName = flowList.find((f) => f.id === schema.flowId)?.name;
          return { ...n, data: { ...(n.data as Record<string, unknown>), flowName } };
        }
        return n;
      })
    );
  }, [flowList]);

  // ----- React Flow event handlers -----

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        // For position-only changes, don't push history — only on drop.
        propagateChange(next, edges);
        return next;
      });
    },
    [edges, propagateChange]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        propagateChange(nodes, next);
        if (changes.some((c) => c.type === "remove")) snapshot();
        return next;
      });
    },
    [nodes, propagateChange, snapshot]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        // Drop any existing edge from the same handle (one-handle = one-edge).
        const filtered = eds.filter(
          (e) =>
            !(
              e.source === params.source &&
              ((e.sourceHandle ?? null) === (params.sourceHandle ?? null))
            )
        );
        const newEdge: Edge = {
          id: `e-${params.source}-${params.sourceHandle ?? "out"}-${params.target}`,
          source: params.source ?? "",
          target: params.target ?? "",
          sourceHandle: params.sourceHandle ?? undefined,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        };
        const next = addEdge(newEdge, filtered);
        propagateChange(nodes, next);
        snapshot();
        return next;
      });
    },
    [nodes, propagateChange, snapshot]
  );

  // ----- Add / update / delete nodes -----

  const addNodeAt = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const id = makeId(type);
      const schemaNode = defaultSchemaNodeFor(type, id);
      if (!schemaNode) return;
      const newNode: Node = {
        id,
        type,
        position,
        data: { schemaNode } as unknown as Record<string, unknown>,
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        propagateChange(next, edges);
        return next;
      });
      snapshot();
      setSelectedId(id);
    },
    [edges, propagateChange, snapshot]
  );

  const addNodeAtCenter = useCallback(
    (type: string) => {
      if (!rfInstance) return addNodeAt(type, { x: 0, y: 0 });
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return addNodeAt(type, { x: 0, y: 0 });
      const rect = wrapper.getBoundingClientRect();
      const pos = rfInstance.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      addNodeAt(type, pos);
    },
    [rfInstance, addNodeAt]
  );

  const updateNode = useCallback(
    (id: string, data: unknown) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === id ? { ...n, data: data as Record<string, unknown> } : n));
        propagateChange(next, edges);
        return next;
      });
      debouncedSnapshot();
    },
    [edges, propagateChange, debouncedSnapshot]
  );

  const updateTriggers = useCallback(
    (next: FlowTrigger[]) => {
      setNodes((nds) => {
        const out = nds.map((n) =>
          n.id === TRIGGER_NODE_ID
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  triggers: next,
                },
              }
            : n
        );
        propagateChange(out, edges);
        return out;
      });
      debouncedSnapshot();
    },
    [edges, propagateChange, debouncedSnapshot]
  );

  // Clipboard для copy/paste/duplicate. Храним «голую» схему ноды,
  // не визуальную обвязку — позиция и id задаются заново на paste.
  const clipboardRef = useRef<FlowNode | null>(null);

  // Дубликат текущей ноды на канвасе. Новый id, лёгкий offset, ВСЕ
  // outbound-ссылки (next/timeoutNext/onError/defaultNext/branches[].next/
  // rules[].next) сбрасываются — копия начинается как «висящая» нода,
  // автор подключит вручную.
  const duplicateSchema = useCallback(
    (src: FlowNode, position: { x: number; y: number }) => {
      const id = makeId(src.type);
      const clone = JSON.parse(JSON.stringify(src)) as FlowNode;
      clone.id = id;
      // Сбросить исходящие ссылки — иначе склонированная нода ведёт
      // в те же таргеты, что оригинал, и getting confused.
      if ("next" in clone) clone.next = undefined;
      if (clone.type === "wait_reply") clone.timeoutNext = undefined;
      if (clone.type === "http_request") clone.onError = undefined;
      if (clone.type === "condition") {
        clone.defaultNext = undefined;
        clone.rules = clone.rules.map((r) => ({ ...r, next: "" }));
      }
      if (clone.type === "split") {
        clone.branches = clone.branches.map((b) => ({ ...b, next: undefined }));
      }
      const newNode: Node = {
        id,
        type: clone.type,
        position,
        data: { schemaNode: clone } as unknown as Record<string, unknown>,
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        propagateChange(next, edges);
        return next;
      });
      snapshot();
      setSelectedId(id);
    },
    [edges, propagateChange, snapshot]
  );

  const copySelected = useCallback(() => {
    if (!selectedId || selectedId === TRIGGER_NODE_ID) return false;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return false;
    const schema = (node.data as unknown as SchemaNodeData).schemaNode;
    if (!schema) return false;
    clipboardRef.current = schema;
    return true;
  }, [nodes, selectedId]);

  const pasteFromClipboard = useCallback(() => {
    if (!clipboardRef.current) return;
    const src = clipboardRef.current;
    // Позиция новой ноды — относительно исходной (если она ещё на холсте)
    // со смещением +40,+40, либо центр канваса как fallback.
    let pos: { x: number; y: number } = { x: 0, y: 0 };
    const original = nodes.find((n) => {
      const s = (n.data as unknown as SchemaNodeData).schemaNode;
      return s && s.id === src.id;
    });
    if (original) {
      pos = { x: original.position.x + 40, y: original.position.y + 40 };
    } else if (rfInstance && reactFlowWrapper.current) {
      const rect = reactFlowWrapper.current.getBoundingClientRect();
      pos = rfInstance.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    duplicateSchema(src, pos);
  }, [nodes, duplicateSchema, rfInstance]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || selectedId === TRIGGER_NODE_ID) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return;
    const schema = (node.data as unknown as SchemaNodeData).schemaNode;
    if (!schema) return;
    duplicateSchema(schema, {
      x: node.position.x + 40,
      y: node.position.y + 40,
    });
  }, [nodes, selectedId, duplicateSchema]);

  const deleteNode = useCallback(
    (id: string) => {
      if (id === TRIGGER_NODE_ID) return;
      setNodes((nds) => {
        const next = nds.filter((n) => n.id !== id);
        setEdges((eds) => {
          const e2 = eds.filter((e) => e.source !== id && e.target !== id);
          propagateChange(next, e2);
          return e2;
        });
        return next;
      });
      snapshot();
      if (selectedId === id) setSelectedId(null);
    },
    [propagateChange, selectedId, snapshot]
  );

  // ----- Drag-and-drop from palette -----

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/x-flow-node-type");
      if (!type || !rfInstance) return;
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNodeAt(type, position);
    },
    [rfInstance, addNodeAt]
  );

  // ----- Undo/redo -----

  const undo = useCallback(() => {
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current.pop();
    if (current) futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    const rfNodes = enrich(prev.nodes);
    const rfEdges = decorateEdges(prev.edges);
    setNodes(rfNodes);
    setEdges(rfEdges);
    propagateChange(rfNodes, rfEdges);
  }, [enrich, decorateEdges, propagateChange]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    const rfNodes = enrich(next.nodes);
    const rfEdges = decorateEdges(next.edges);
    setNodes(rfNodes);
    setEdges(rfEdges);
    propagateChange(rfNodes, rfEdges);
  }, [enrich, decorateEdges, propagateChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      // Игнорируем шорткаты, если фокус в редактируемом поле — иначе
      // Cmd-C в textarea не скопирует выделенный текст.
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inEditable) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "c") {
        // Cmd/Ctrl-C — копируем выделенную ноду в наш «буфер» (in-memory).
        if (copySelected()) e.preventDefault();
      } else if (e.key === "v") {
        // Cmd/Ctrl-V — вставляем из «буфера» (новый id, sibling-позиция).
        if (clipboardRef.current) {
          e.preventDefault();
          pasteFromClipboard();
        }
      } else if (e.key === "d") {
        // Cmd/Ctrl-D — клонировать текущую (без промежуточного copy).
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, copySelected, pasteFromClipboard, duplicateSelected]);

  // ----- Render -----

  const editorNodeList = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type ?? "",
        data: n.data as unknown,
      })),
    [nodes]
  );

  return (
    <div className="flex border rounded-lg overflow-hidden bg-white" style={{ minHeight: 680 }}>
      <NodePalette onAdd={addNodeAtCenter} />
      <div
        className="flex-1 relative"
        ref={reactFlowWrapper}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="absolute top-2 left-2 z-10 flex gap-1">
          <Button variant="outline" size="sm" onClick={undo} title="Undo (Cmd/Ctrl-Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={redo} title="Redo (Cmd/Ctrl-Shift-Z)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={duplicateSelected}
            disabled={!selectedId || selectedId === TRIGGER_NODE_ID}
            title="Дублировать ноду (Cmd/Ctrl-D). Cmd-C / Cmd-V — копировать/вставить."
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {unreachableCount > 0 && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-amber-50 border border-amber-300 text-amber-900 text-xs px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2 pointer-events-none">
            <span>⚠</span>
            <span>
              Недостижимые ноды: <strong>{unreachableCount}</strong> — не подключены к графу через стрелки
            </span>
          </div>
        )}
        <SemanticIssuesPanel
          issues={semanticIssues}
          onJumpTo={(nodeId) => setSelectedId(nodeId)}
        />
        <ReactFlow
          nodes={displayedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onSelectionChange={(s) => {
            setSelectedId(s.nodes[0]?.id ?? null);
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.25}
          maxZoom={2}
        >
          <Background gap={24} size={1} />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable />
        </ReactFlow>
      </div>
      <PropertiesPanel
        selectedNodeId={selectedId}
        nodes={editorNodeList}
        flowList={flowList}
        currentFlowId={currentFlowId}
        onUpdateNode={updateNode}
        onUpdateTriggers={updateTriggers}
        onDeleteNode={deleteNode}
      />
    </div>
  );
}

export function FlowEditor(props: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

// Плавающая панелька со списком семантических проблем флоу. Свёрнута
// по умолчанию (счётчик в шапке), разворачивается кликом. Каждая
// проблема — кнопка, прыгающая на соответствующую ноду в редакторе.
function SemanticIssuesPanel({
  issues,
  onJumpTo,
}: {
  issues: FlowIssue[];
  onJumpTo: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (issues.length === 0) return null;
  const errs = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const anyError = errs.length > 0;

  return (
    <div
      className={`absolute bottom-3 left-3 z-10 rounded-md border shadow-md text-xs max-w-md ${
        anyError
          ? "bg-red-50 border-red-300"
          : "bg-amber-50 border-amber-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 ${
          anyError ? "text-red-900" : "text-amber-900"
        }`}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          {anyError ? (
            <span>
              Ошибок: <strong>{errs.length}</strong>
              {warns.length > 0 && (
                <span className="text-amber-700">
                  , warnings: <strong>{warns.length}</strong>
                </span>
              )}
            </span>
          ) : (
            <span>
              Замечаний: <strong>{warns.length}</strong>
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <div className="max-h-72 overflow-y-auto border-t border-current/20 px-2 py-2 space-y-1.5">
          {/* Errors сверху, потом warnings */}
          {[...errs, ...warns].map((iss, idx) => (
            <button
              type="button"
              key={`${iss.code}-${iss.nodeId ?? "_"}-${idx}`}
              onClick={() => iss.nodeId && onJumpTo(iss.nodeId)}
              disabled={!iss.nodeId}
              className={`w-full text-left rounded px-2 py-1 hover:bg-white/60 disabled:cursor-default disabled:hover:bg-transparent ${
                iss.severity === "error"
                  ? "text-red-900"
                  : "text-amber-900"
              }`}
            >
              <div className="font-mono text-[10px] uppercase opacity-70">
                {iss.code}
                {iss.nodeId && (
                  <span className="ml-1 text-zinc-500">→ {iss.nodeId}</span>
                )}
              </div>
              <div className="leading-snug">{iss.message}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export palette items so the page can reuse them for empty-state hints.
export { PALETTE_ITEMS };
