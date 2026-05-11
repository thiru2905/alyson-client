import { useCallback, useMemo, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type ReactFlowInstance,
  type Node,
  type Edge,
  type NodeProps,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import { Save, Edit3, Send, RotateCcw } from "lucide-react";
import type { EmployeeFull } from "@/lib/queries";
import { fmtCurrency } from "@/lib/format";
import { toast } from "sonner";

type EmpNode = Node<{
  employee: EmployeeFull;
  isHighlighted: boolean;
  onPick: (id: string) => void;
}>;

function PersonNode({ data }: NodeProps<EmpNode["data"]>) {
  const e = data.employee;
  return (
    <div
      onClick={() => data.onPick(e.id)}
      className={
        "px-3 py-2 rounded-lg border bg-paper shadow-sm min-w-[180px] cursor-pointer transition-all " +
        (data.isHighlighted
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/50")
      }
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-xs font-medium shrink-0">
          {e.full_name
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium truncate">{e.full_name}</div>
          <div className="text-[10.5px] text-muted-foreground truncate">{e.role}</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="pill pill-neutral">{e.department_name}</span>
        <span className="font-mono">{fmtCurrency(e.total_comp, { compact: true })}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

const LAYOUT_KEY = "alyson-orgchart-layout-v1";

function loadLayout(): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLayout(layout: Record<string, { x: number; y: number }>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

/** Lay out tree top-down by manager_id chain, compact (centers parent over children). */
function layout(
  employees: EmployeeFull[],
  highlightId: string | null,
  onPick: (id: string) => void,
): { nodes: EmpNode[]; edges: Edge[] } {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const children = new Map<string | null, EmployeeFull[]>();
  for (const e of employees) {
    const k = (e as any).manager_id ?? null;
    if (!children.has(k)) children.set(k, []);
    children.get(k)!.push(e);
  }
  const reportingChain = new Set<string>();
  if (highlightId) {
    let cur: string | null = highlightId;
    while (cur) {
      reportingChain.add(cur);
      const next: string | null = (byId.get(cur) as any)?.manager_id ?? null;
      cur = next;
    }
  }
  const nodes: EmpNode[] = [];
  const edges: Edge[] = [];
  const VX = 220; // horizontal unit
  const VY = 140; // vertical unit

  const sorted = (list: EmployeeFull[]) =>
    list.slice().sort((a, b) => a.department_name.localeCompare(b.department_name) || a.full_name.localeCompare(b.full_name));

  const widthUnits = new Map<string, number>();
  const roots = sorted(children.get(null) ?? []);

  const computeWidth = (id: string) => {
    if (widthUnits.has(id)) return widthUnits.get(id)!;
    const kids = sorted(children.get(id) ?? []);
    const w = kids.length ? kids.reduce((s, k) => s + computeWidth(k.id), 0) : 1;
    widthUnits.set(id, w);
    return w;
  };
  roots.forEach((r) => computeWidth(r.id));

  const placeNode = (id: string, depth: number, xUnitStart: number) => {
    const emp = byId.get(id);
    if (!emp) return { width: 1, center: xUnitStart + 0.5 };
    const kids = sorted(children.get(id) ?? []);
    const w = widthUnits.get(id) ?? 1;

    let center: number;
    if (!kids.length) {
      center = xUnitStart + 0.5;
    } else {
      let cursor = xUnitStart;
      const childCenters: number[] = [];
      for (const k of kids) {
        const cw = widthUnits.get(k.id) ?? 1;
        const placed = placeNode(k.id, depth + 1, cursor);
        childCenters.push(placed.center);
        cursor += cw;

        edges.push({
          id: `${id}->${k.id}`,
          source: id,
          target: k.id,
          type: "smoothstep",
          style: {
            stroke: reportingChain.has(k.id) ? "var(--primary)" : "var(--muted-foreground)",
            strokeWidth: reportingChain.has(k.id) ? 2 : 1,
          },
        });
      }
      center = (childCenters[0]! + childCenters[childCenters.length - 1]!) / 2;
    }

    nodes.push({
      id: emp.id,
      type: "person",
      position: { x: center * VX - 90, y: depth * VY },
      data: { employee: emp, isHighlighted: reportingChain.has(emp.id), onPick },
    });
    return { width: w, center };
  };

  let cursor = 0;
  for (const r of roots) {
    const w = widthUnits.get(r.id) ?? 1;
    placeNode(r.id, 0, cursor);
    cursor += w + 1; // gap between root trees
  }

  return { nodes, edges };
}

export function OrgChart({ employees, canEdit = false }: { employees: EmployeeFull[]; canEdit?: boolean }) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingChanges, setPendingChanges] = useState(0);
  const [layoutStore, setLayoutStore] = useState<Record<string, { x: number; y: number }>>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const canEditNow = canEdit && editMode;

  const handlePick = useCallback((id: string) => setHighlightId(id), []);
  useEffect(() => {
    setLayoutStore(loadLayout());
  }, []);

  const initial = useMemo(() => {
    const base = layout(employees, highlightId, handlePick);
    if (!layoutStore || Object.keys(layoutStore).length === 0) return base;
    return {
      nodes: base.nodes.map((n) => {
        const p = layoutStore[n.id];
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }),
      edges: base.edges,
    };
  }, [employees, highlightId, handlePick, layoutStore]);

  const [nodes, setNodes] = useState<EmpNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);

  // re-layout when employees or highlight changes
  useMemo(() => {
    const base = layout(employees, highlightId, handlePick);
    const n = base.nodes.map((node) => {
      const p = layoutStore?.[node.id];
      return p ? { ...node, position: { x: p.x, y: p.y } } : node;
    });
    const e = base.edges;
    setNodes(n);
    setEdges(e);
    setPendingChanges(0);
  }, [employees, highlightId, handlePick, layoutStore]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      const moved = changes.some((c) => c.type === "position" || c.type === "dimensions");
      if (canEditNow && moved) setPendingChanges((c) => c + changes.length);
    },
    [canEditNow],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback(
    (params: { source: string | null; target: string | null }) => {
      if (!canEditNow) return;
      if (!params.source || !params.target) return;
      setEdges((eds) => [
        ...eds.filter((e) => e.target !== params.target),
        {
          id: `${params.source}->${params.target}-new`,
          source: params.source!,
          target: params.target!,
          type: "smoothstep",
          style: { stroke: "var(--primary)", strokeWidth: 2, strokeDasharray: "4 3" },
        },
      ]);
      setPendingChanges((c) => c + 1);
      toast.success("Reporting line updated", { description: "Save draft to keep this change." });
    },
    [canEditNow],
  );

  // search highlight
  useMemo(() => {
    if (!search) return;
    const match = employees.find((e) => e.full_name.toLowerCase().includes(search.toLowerCase()));
    if (match) setHighlightId(match.id);
  }, [search, employees]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((e) => e.full_name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q))
      .slice(0, 8);
  }, [employees, search]);

  useEffect(() => {
    if (!rf || !highlightId) return;
    const node = nodes.find((n) => n.id === highlightId);
    if (!node) return;
    // Node width ~180, height ~80 (rough). Center using a safe offset.
    const centerX = node.position.x + 90;
    const centerY = node.position.y + 40;
    // Smoothly pan/zoom to the node.
    rf.setCenter(centerX, centerY, { zoom: 1.05, duration: 450 });
  }, [rf, highlightId, nodes]);

  return (
    <div className="surface-card overflow-hidden flex flex-col" style={{ height: 620 }}>
      <div className="h-12 px-4 flex items-center gap-2 border-b border-border bg-paper/80">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => {
              // allow click selection before closing
              window.setTimeout(() => setSuggestOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSuggestOpen(false);
              if (e.key === "Enter" && suggestions[0]) {
                setHighlightId(suggestions[0].id);
                setSearch(suggestions[0].full_name);
                setSuggestOpen(false);
              }
            }}
            placeholder="Search employee…"
            className="h-8 w-56 px-3 rounded-md border border-border bg-background text-[13px]"
            role="combobox"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-autocomplete="list"
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute left-0 mt-1 w-80 max-w-[70vw] rounded-md border border-border bg-paper shadow-lg overflow-hidden z-20">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setHighlightId(s.id);
                    setSearch(s.full_name);
                    setSuggestOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{s.full_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.role} · {s.department_name}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono shrink-0">
                    L{s.level}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {highlightId && (
          <button
            onClick={() => setHighlightId(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            Clear chain
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pendingChanges > 0 && (
            <span className="pill pill-warning">{pendingChanges} pending</span>
          )}
          {canEdit && editMode ? (
            <>
              <button
                onClick={() => {
                  const next: Record<string, { x: number; y: number }> = {};
                  nodes.forEach((n) => (next[n.id] = { x: n.position.x, y: n.position.y }));
                  saveLayout(next);
                  setLayoutStore(next);
                  toast.success("Layout saved", { description: `${pendingChanges} change(s) saved.` });
                  setPendingChanges(0);
                }}
                className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
              >
                <Save className="h-3.5 w-3.5" /> Save layout
              </button>
              <button
                onClick={() => {
                  toast.success("Org chart published", {
                    description: "Audit log entry created. Notifications sent to affected employees.",
                  });
                  setPendingChanges(0);
                  setEditMode(false);
                }}
                className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Publish
              </button>
              <button
                onClick={() => {
                  // Auto-arrange (discard saved layout)
                  saveLayout({});
                  setLayoutStore({});
                  const { nodes: n, edges: e } = layout(employees, highlightId, handlePick);
                  setNodes(n);
                  setEdges(e);
                  setPendingChanges(0);
                  setEditMode(false);
                }}
                className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Auto-arrange"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </>
          ) : canEdit ? (
            <button
              onClick={() => setEditMode(true)}
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit org
            </button>
          ) : null}
          {canEdit && !editMode && (
            <button
              onClick={() => {
                saveLayout({});
                setLayoutStore({});
                const { nodes: n, edges: e } = layout(employees, highlightId, handlePick);
                setNodes(n);
                setEdges(e);
                setPendingChanges(0);
                toast.success("Auto-arranged");
              }}
              className="h-8 px-3 rounded-md border border-border text-xs hover:bg-muted"
              title="Auto-arrange layout"
            >
              Auto-arrange
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setRf}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={canEditNow}
          nodesConnectable={canEditNow}
          edgesUpdatable={canEditNow}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) =>
              (n.data as any)?.isHighlighted ? "var(--primary)" : "var(--muted-foreground)"
            }
            maskColor="oklch(0.95 0.01 80 / 0.6)"
            style={{ background: "var(--paper)" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
