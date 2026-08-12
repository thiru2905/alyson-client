import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Network,
  RefreshCw,
  Database,
  Users,
  FolderKanban,
  ListTodo,
  Tags,
  Captions,
  Search,
  Sparkles,
  CalendarRange,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { toast } from "sonner";
import {
  bootstrapKnowledgeGraphSchemaFn,
  getKnowledgeGraphOverview,
  getKnowledgeGraphStatus,
  queryMeetingNeighborhoodFn,
  queryPersonMeetingsFn,
  queryWindowGraphFn,
  runKnowledgeGraphSyncFn,
} from "@/lib/knowledge-graph-functions";

export const Route = createFileRoute("/alyson-notetaker/knowledge-graph")({
  head: () => ({ meta: [{ title: "Knowledge Graph — Alyson" }] }),
  component: KnowledgeGraphPage,
});

const KIND_COLORS: Record<string, string> = {
  Meeting: "#0f766e",
  Person: "#1d4ed8",
  Project: "#b45309",
  Task: "#7c3aed",
  Topic: "#be123c",
};

function dayOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function RankList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: Array<{ key: string; label: string; count: number }>;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
        {title}
      </div>
      <ul className="divide-y divide-border max-h-64 overflow-auto">
        {items.length === 0 ? (
          <li className="px-3 py-4 text-[12px] text-muted-foreground">No data yet — run a sync.</li>
        ) : (
          items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect?.(item.key)}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-[12.5px] truncate">{item.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                  {item.count}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function layoutGraphNodes(
  nodes: Array<{ id: string; kind: string; label: string }>,
): Node[] {
  if (!nodes.length) return [];
  const byKind = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const arr = byKind.get(n.kind) ?? [];
    arr.push(n);
    byKind.set(n.kind, arr);
  }
  const kindOrder = ["Meeting", "Person", "Project", "Topic", "Task"];
  const out: Node[] = [];
  let col = 0;
  for (const kind of kindOrder) {
    const group = byKind.get(kind) ?? [];
    group.forEach((n, i) => {
      out.push({
        id: n.id,
        position: { x: col * 220, y: i * 72 },
        data: { label: n.label },
        style: {
          background: KIND_COLORS[kind] || "#334155",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 11,
          padding: "8px 10px",
          width: 180,
        },
      });
    });
    if (group.length) col += 1;
  }
  return out;
}

function KnowledgeGraphPage() {
  const qc = useQueryClient();
  const [personEmail, setPersonEmail] = useState("");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [syncBatch, setSyncBatch] = useState(25);
  const [fromDay, setFromDay] = useState(() => dayOffset(-14));
  const [toDay, setToDay] = useState(() => dayOffset(0));
  const [includeTasks, setIncludeTasks] = useState(true);
  const [maxMeetings, setMaxMeetings] = useState(35);

  const viewMode: "window" | "meeting" = selectedBotId ? "meeting" : "window";

  const statusQ = useQuery({
    queryKey: ["kg-status", "v2"],
    queryFn: () => getKnowledgeGraphStatus(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const overviewQ = useQuery({
    queryKey: ["kg-overview", "v2"],
    queryFn: () => getKnowledgeGraphOverview(),
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const windowQ = useQuery({
    queryKey: ["kg-window", fromDay, toDay, maxMeetings, includeTasks],
    queryFn: () =>
      queryWindowGraphFn({
        data: { fromDay, toDay, maxMeetings, includeTasks },
      }),
    enabled: Boolean(statusQ.data?.health.ok ?? true),
    staleTime: 15_000,
  });

  const personQ = useQuery({
    queryKey: ["kg-person", personEmail, fromDay, toDay],
    queryFn: () =>
      queryPersonMeetingsFn({
        data: { email: personEmail, fromDay, toDay, limit: 40 },
      }),
    enabled: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personEmail),
    staleTime: 30_000,
  });

  const neighborhoodQ = useQuery({
    queryKey: ["kg-neighborhood", selectedBotId],
    queryFn: () => queryMeetingNeighborhoodFn({ data: { botId: selectedBotId!, limit: 50 } }),
    enabled: Boolean(selectedBotId),
    staleTime: 30_000,
  });

  const schemaM = useMutation({
    mutationFn: () => bootstrapKnowledgeGraphSchemaFn(),
    onSuccess: () => {
      toast.success("Neo4j schema ready");
      void qc.invalidateQueries({ queryKey: ["kg-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Schema failed"),
  });

  const syncM = useMutation({
    mutationFn: () => runKnowledgeGraphSyncFn({ data: { maxMeetings: syncBatch } }),
    onSuccess: (res) => {
      if (!res.enabled) {
        toast.message("KG disabled", {
          description: "Set KNOWLEDGE_GRAPH_ENABLED=true in .env and restart.",
        });
        return;
      }
      toast.success(
        `Synced ${res.synced} meeting(s) · skipped ${res.skipped} · errors ${res.errors}`,
      );
      void qc.invalidateQueries({ queryKey: ["kg-status"] });
      void qc.invalidateQueries({ queryKey: ["kg-overview"] });
      void qc.invalidateQueries({ queryKey: ["kg-window"] });
      void qc.invalidateQueries({ queryKey: ["kg-neighborhood"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const overview = overviewQ.data?.overview;
  const summary = overview?.summary ?? statusQ.data?.summary;
  const healthOk = overviewQ.data?.health.ok ?? statusQ.data?.health.ok;
  const healthError =
    overviewQ.data?.health.error ?? statusQ.data?.health.error ?? null;
  const recentMeetings =
    overview?.recentMeetings ?? statusQ.data?.recentMeetings ?? [];
  const listsLoading = statusQ.isLoading || (overviewQ.isLoading && recentMeetings.length === 0);
  const listsError =
    (statusQ.isError && overviewQ.isError
      ? statusQ.error instanceof Error
        ? statusQ.error.message
        : "Failed to load graph"
      : null) ||
    (healthOk === false ? healthError : null);

  const activeGraph = viewMode === "meeting" ? neighborhoodQ.data : windowQ.data;
  const graphLoading =
    viewMode === "meeting" ? neighborhoodQ.isLoading : windowQ.isLoading;
  const graphError =
    viewMode === "meeting"
      ? neighborhoodQ.isError
        ? neighborhoodQ.error instanceof Error
          ? neighborhoodQ.error.message
          : "Neighborhood failed"
        : null
      : windowQ.isError
        ? windowQ.error instanceof Error
          ? windowQ.error.message
          : "Window graph failed"
        : null;

  const flowNodes: Node[] = useMemo(
    () => layoutGraphNodes(activeGraph?.nodes ?? []),
    [activeGraph?.nodes],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      (activeGraph?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: "#94a3b8" },
        labelStyle: { fontSize: 9, fill: "#64748b" },
      })),
    [activeGraph?.edges],
  );

  const selectMeeting = useCallback((botId: string) => {
    setSelectedBotId(botId);
  }, []);

  const showWindow = useCallback(() => {
    setSelectedBotId(null);
  }, []);

  const applyPreset = useCallback((days: number) => {
    setFromDay(dayOffset(-days));
    setToDay(dayOffset(0));
    setSelectedBotId(null);
  }, []);

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Operations"
        title="Knowledge Graph"
        description="Neo4j map of people, projects, topics, and tasks across your meeting corpus — overall understanding from real transcripts and notes."
        dense
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/alyson-notetaker"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <Captions className="h-3.5 w-3.5" />
              Notetaker
            </Link>
            <button
              type="button"
              onClick={() => schemaM.mutate()}
              disabled={schemaM.isPending}
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Database className="h-3.5 w-3.5" />
              Schema
            </button>
            <select
              value={syncBatch}
              onChange={(e) => setSyncBatch(Number(e.target.value))}
              className="h-7 px-2 rounded-md border border-border bg-background text-[11.5px]"
            >
              {[10, 25, 50, 100, 200, 450].map((n) => (
                <option key={n} value={n}>
                  Sync {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => syncM.mutate()}
              disabled={syncM.isPending}
              className="h-7 px-2.5 rounded-md bg-foreground text-background text-[11.5px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncM.isPending ? "animate-spin" : ""}`} />
              Sync meetings
            </button>
          </div>
        }
      />

      <div className="app-page-gutter space-y-4 pb-8">
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-[12px] flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Neo4j:{" "}
            <strong className={healthOk ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700"}>
              {healthOk ? "connected" : statusQ.data?.health.error || "offline"}
            </strong>
          </span>
          <span>
            Flag:{" "}
            <strong>{statusQ.data?.enabled ? "enabled" : "disabled (set KNOWLEDGE_GRAPH_ENABLED=true)"}</strong>
          </span>
          <span>
            Domain: <strong>{statusQ.data?.domain || "cintara.ai"}</strong>
          </span>
          <span className="text-muted-foreground">{statusQ.data?.uri}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard label="People" value={summary?.people ?? "—"} icon={Users} />
          <StatCard label="Meetings" value={summary?.meetings ?? "—"} icon={Network} />
          <StatCard label="Projects" value={summary?.projects ?? "—"} icon={FolderKanban} />
          <StatCard label="Topics" value={summary?.topics ?? "—"} icon={Tags} />
          <StatCard label="Tasks" value={summary?.tasks ?? "—"} icon={ListTodo} />
          <StatCard label="Attended" value={summary?.attendedEdges ?? "—"} icon={Sparkles} />
        </div>

        <div className="rounded-lg border border-border bg-background px-3 py-2.5 flex flex-wrap items-center gap-2">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium mr-1">
            Window
          </span>
          <input
            type="date"
            value={fromDay}
            onChange={(e) => {
              setFromDay(e.target.value);
              setSelectedBotId(null);
            }}
            className="h-7 px-2 rounded-md border border-border bg-background text-[12px]"
          />
          <span className="text-[11px] text-muted-foreground">to</span>
          <input
            type="date"
            value={toDay}
            onChange={(e) => {
              setToDay(e.target.value);
              setSelectedBotId(null);
            }}
            className="h-7 px-2 rounded-md border border-border bg-background text-[12px]"
          />
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => applyPreset(d)}
              className="h-7 px-2 rounded-md border border-border text-[11.5px] hover:bg-muted/40"
            >
              {d}d
            </button>
          ))}
          <select
            value={maxMeetings}
            onChange={(e) => setMaxMeetings(Number(e.target.value))}
            className="h-7 px-2 rounded-md border border-border bg-background text-[11.5px]"
            title="Max meetings drawn in the window graph"
          >
            {[20, 35, 50, 80].map((n) => (
              <option key={n} value={n}>
                Max {n} meetings
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground ml-1">
            <input
              type="checkbox"
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
              className="rounded border-border"
            />
            Include tasks
          </label>
          {viewMode === "meeting" ? (
            <button
              type="button"
              onClick={showWindow}
              className="h-7 px-2.5 rounded-md bg-foreground text-background text-[11.5px] font-medium ml-auto"
            >
              Back to window graph
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground ml-auto">
              {windowQ.data
                ? `${windowQ.data.meetingCount} meetings · ${windowQ.data.nodes.length} nodes · ${windowQ.data.edges.length} edges`
                : "Loading window…"}
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <RankList
            title="Most active people"
            items={(overview?.topPeople ?? []).map((p) => ({
              key: p.email,
              label: p.name ? `${p.name} · ${p.email}` : p.email,
              count: p.meetingCount,
            }))}
            onSelect={(email) => setPersonEmail(email)}
          />
          <RankList
            title="Top projects"
            items={(overview?.topProjects ?? []).map((p) => ({
              key: p.key,
              label: p.name || p.key,
              count: p.meetingCount,
            }))}
          />
          <RankList
            title="Top topics"
            items={(overview?.topTopics ?? []).map((t) => ({
              key: t.key,
              label: t.name || t.key,
              count: t.meetingCount,
            }))}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                Meetings in window
              </div>
              <span className="text-[10px] text-muted-foreground">Click to drill into one meeting</span>
            </div>
            <ul className="divide-y divide-border max-h-72 overflow-auto">
              {listsLoading && !(windowQ.data?.meetings?.length) ? (
                <li className="px-3 py-4 text-[12px] text-muted-foreground">Loading meetings…</li>
              ) : listsError ? (
                <li className="px-3 py-4 text-[12px] text-muted-foreground space-y-1">
                  <div>Neo4j unreachable — use `bolt://127.0.0.1:7688` and `npm run kg:up`.</div>
                  <div className="text-[11px] opacity-80">{listsError}</div>
                </li>
              ) : (windowQ.data?.meetings ?? recentMeetings).length === 0 ? (
                <li className="px-3 py-4 text-[12px] text-muted-foreground">
                  No meetings in this window — widen the dates or Sync more.
                </li>
              ) : (
                (windowQ.data?.meetings ?? recentMeetings).map((m) => (
                  <li key={m.botId}>
                    <button
                      type="button"
                      onClick={() => selectMeeting(m.botId)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors ${
                        selectedBotId === m.botId ? "bg-muted/50" : ""
                      }`}
                    >
                      <div className="text-[12.5px] font-medium truncate">{m.title}</div>
                      <div className="text-[11px] text-muted-foreground flex gap-2">
                        <span>{m.meetingDay || "—"}</span>
                        {"attendees" in m ? <span>{(m as { attendees?: number }).attendees} people</span> : null}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value.trim())}
                placeholder="Person email (e.g. name@cintara.ai)"
                className="flex-1 h-7 bg-transparent text-[12.5px] outline-none"
              />
            </div>
            <div className="p-3 space-y-3 max-h-72 overflow-auto">
              {!personEmail ? (
                <p className="text-[12px] text-muted-foreground">
                  Search a teammate to see meetings attended in this window and projects inferred from
                  the graph.
                </p>
              ) : personQ.isLoading ? (
                <p className="text-[12px] text-muted-foreground">Loading…</p>
              ) : personQ.isError ? (
                <p className="text-[12px] text-amber-700">
                  {personQ.error instanceof Error ? personQ.error.message : "Query failed"}
                </p>
              ) : (
                <>
                  <div className="text-[12.5px]">
                    <strong>{personQ.data?.meetings.name || personEmail}</strong>
                    <span className="text-muted-foreground">
                      {" "}
                      · {personQ.data?.meetings.meetingCount ?? 0} meetings in window
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
                      Projects
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(personQ.data?.projects ?? []).length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">None linked yet</span>
                      ) : (
                        personQ.data!.projects.map((p) => (
                          <span
                            key={p.key}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          >
                            {p.name} ({p.meetingCount})
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {(personQ.data?.meetings.meetings ?? []).map((m) => (
                      <li key={m.botId}>
                        <button
                          type="button"
                          onClick={() => selectMeeting(m.botId)}
                          className="text-left text-[12px] hover:underline"
                        >
                          {m.meetingDay || "—"} · {m.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
              {viewMode === "meeting"
                ? `Meeting drill-down — ${neighborhoodQ.data?.meeting?.title || "…"}`
                : `Corpus graph — ${fromDay} → ${toDay}`}
            </div>
            {viewMode === "meeting" && selectedBotId ? (
              <span className="text-[10px] text-muted-foreground font-mono">
                {selectedBotId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
          <div className="h-[520px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100/80 via-background to-background dark:from-slate-900/40">
            {graphLoading ? (
              <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                Loading graph…
              </div>
            ) : graphError ? (
              <div className="h-full flex items-center justify-center text-[13px] text-amber-700 px-6 text-center">
                {graphError}
              </div>
            ) : flowNodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground px-6 text-center">
                No nodes in this window — widen the date range or Sync more meetings.
              </div>
            ) : (
              <ReactFlow
                key={viewMode === "meeting" ? `m:${selectedBotId}` : `w:${fromDay}:${toDay}:${maxMeetings}`}
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={18} size={1} />
                <MiniMap pannable zoomable />
                <Controls showInteractive={false} />
              </ReactFlow>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
          Default view is the <strong>time-window corpus graph</strong> (people ↔ meetings ↔
          projects/topics/tasks). Click a meeting to drill into its neighborhood; use{" "}
          <em>Back to window graph</em> to return. Neo4j Browser:{" "}
          <a className="underline" href="http://localhost:7475" target="_blank" rel="noreferrer">
            localhost:7475
          </a>{" "}
          (neo4j / password). Sync with <code className="text-[10px]">npm run kg:sync 25</code>.
        </p>
      </div>
    </div>
  );
}
