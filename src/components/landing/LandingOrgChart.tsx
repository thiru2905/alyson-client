import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Node, type Edge, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

type MiniPerson = {
  name: string;
  title: string;
  team: string;
};

export function LandingOrgChart({
  className,
  onCta,
}: {
  className?: string;
  onCta?: () => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const people: Array<{ id: string; p: MiniPerson; x: number; y: number }> = [
      { id: "ceo", p: { name: "Ava", title: "CEO", team: "Exec" }, x: 250, y: 30 },
      { id: "fin", p: { name: "Noah", title: "Finance", team: "Money" }, x: 70, y: 150 },
      { id: "hr", p: { name: "Mia", title: "HR Ops", team: "People" }, x: 250, y: 150 },
      { id: "eng", p: { name: "Kai", title: "Engineering", team: "Platform" }, x: 430, y: 150 },
      { id: "mgr1", p: { name: "Zoe", title: "Manager", team: "People" }, x: 170, y: 270 },
      { id: "mgr2", p: { name: "Leo", title: "Manager", team: "Platform" }, x: 350, y: 270 },
      { id: "ic1", p: { name: "Ishaan", title: "Employee", team: "People" }, x: 110, y: 390 },
      { id: "ic2", p: { name: "Aria", title: "Employee", team: "Platform" }, x: 410, y: 390 },
    ];

    // Nodes: custom type "person"
    const nodesTyped: Node[] = people.map((x) => ({
      id: x.id,
      type: "person",
      position: { x: x.x, y: x.y },
      data: x.p,
      draggable: false,
      selectable: false,
      className: cn(x.id === "ceo" && "ring-2 ring-ring/30"),
    }));

    const e: Edge[] = [
      { id: "e1", source: "ceo", target: "fin" },
      { id: "e2", source: "ceo", target: "hr" },
      { id: "e3", source: "ceo", target: "eng" },
      { id: "e4", source: "hr", target: "mgr1" },
      { id: "e5", source: "eng", target: "mgr2" },
      { id: "e6", source: "mgr1", target: "ic1" },
      { id: "e7", source: "mgr2", target: "ic2" },
    ].map((x) => ({
      ...x,
      animated: true,
      style: { stroke: "color-mix(in oklab, var(--muted-foreground) 65%, transparent)", strokeWidth: 1.5 },
    }));

    return { nodes: nodesTyped, edges: e };
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-muted/10", className)}>
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--ink) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-[320px] w-[520px] rounded-full blur-3xl opacity-25" style={{ background: "linear-gradient(90deg, var(--chart-1), var(--chart-2), var(--chart-3))" }} />

      <div className="relative h-[420px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ person: PersonNode }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="surface-card px-3 py-2 bg-background/70 backdrop-blur">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Org intelligence</div>
          <div className="text-sm font-medium mt-0.5">See headcount, cost, and reporting lines — in one canvas.</div>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="h-10 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
        >
          Explore org chart
        </button>
      </div>
    </div>
  );
}

function PersonNode({ data }: NodeProps<MiniPerson>) {
  return (
    <div
      className="rounded-xl border border-border bg-paper/90 shadow-[var(--shadow-soft)] px-3 py-2 w-[150px]"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium truncate">{data.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{data.title}</div>
        </div>
        <div className="h-7 w-7 rounded-full border border-border bg-muted/40 grid place-items-center text-[10px] font-mono text-muted-foreground">
          {data.team.slice(0, 1)}
        </div>
      </div>
    </div>
  );
}

