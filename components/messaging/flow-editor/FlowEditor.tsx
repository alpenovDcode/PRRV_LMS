"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node as RFNode,
  type OnConnect,
  type ReactFlowInstance,
  type OnSelectionChangeParams,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save } from "lucide-react";
import { nodeTypes, NODE_TYPE_CONFIGS } from "./nodes";
import { NodeInspector } from "./NodeInspector";
import { fromReactFlow, toReactFlow, type BackendGraph } from "./graph-converter";

interface FlowEditorProps {
  initialGraph: BackendGraph;
  onSave: (graph: BackendGraph) => Promise<void>;
}

function FlowEditorInner({ initialGraph, onSave }: FlowEditorProps) {
  const initial = toReactFlow(initialGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [startNodeId, setStartNodeId] = useState(initial.startNodeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // ── DnD из палитры ──────────────────────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/flow-node-type");
      if (!type || !rfInstance || !wrapperRef.current) return;

      const cfg = NODE_TYPE_CONFIGS.find((c) => c.type === type);
      if (!cfg) return;

      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const id = `n${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newNode: RFNode = {
        id,
        type,
        position,
        data: cfg.defaults(),
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes]
  );

  // ── Connect (создание edge) ─────────────────────────────────────────────
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Очищаем существующие edges с того же sourceHandle (один handle = один target)
      const handle = connection.sourceHandle ?? "next";
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === connection.source && (e.sourceHandle ?? "next") === handle)
        );
        return addEdge(
          {
            ...connection,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
            style: { strokeWidth: 1.5 },
          },
          filtered
        );
      });
    },
    [setEdges]
  );

  // ── Inspector — изменение данных узла ───────────────────────────────────
  const handleNodePatch = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [setNodes]
  );

  const handleNodeDelete = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges]
  );

  const handleSetStart = useCallback(
    (id: string) => {
      setStartNodeId(id);
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } }))
      );
    },
    [setNodes]
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (params.nodes.length === 1) {
      setSelectedId(params.nodes[0].id);
    } else {
      setSelectedId(null);
    }
  }, []);

  // ── Сохранение ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      const backendGraph = fromReactFlow({ nodes, edges, startNodeId });
      await onSave(backendGraph);
      setSavedAt(new Date());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, startNodeId, onSave]);

  // ── Ctrl/Cmd+S ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
      {/* Палитра */}
      <div className="w-56 bg-white border-r border-gray-200 p-3 flex flex-col gap-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
          Перетащи на холст
        </div>
        {NODE_TYPE_CONFIGS.map((cfg) => {
          const Icon = cfg.icon;
          return (
            <div
              key={cfg.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/flow-node-type", cfg.type);
                e.dataTransfer.effectAllowed = "move";
              }}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:shadow-sm ${cfg.colorClass}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium truncate">{cfg.label}</span>
            </div>
          );
        })}

        <div className="mt-auto pt-3 border-t border-gray-100 space-y-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
          {saveError && (
            <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 p-1.5 rounded">
              {saveError}
            </p>
          )}
          {savedAt && !saveError && (
            <p className="text-[10px] text-green-600 text-center">
              ✓ {savedAt.toLocaleTimeString("ru-RU")}
            </p>
          )}
          <p className="text-[10px] text-gray-400 text-center">⌘+S для сохранения</p>
        </div>
      </div>

      {/* Холст */}
      <div className="flex-1" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onInit={setRfInstance}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
            style: { strokeWidth: 1.5 },
          }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={20} size={1} color="#e5e7eb" />
          <Controls className="!shadow-sm" />
          <MiniMap pannable zoomable className="!bg-white" />
        </ReactFlow>
      </div>

      {/* Inspector */}
      <NodeInspector
        node={selectedNode}
        onChange={handleNodePatch}
        onDelete={handleNodeDelete}
        onSetStart={handleSetStart}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

export default function FlowEditor(props: FlowEditorProps) {
  // ReactFlowProvider обязателен чтобы useReactFlow работал внутри
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
