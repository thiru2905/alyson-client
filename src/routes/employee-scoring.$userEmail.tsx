import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Brain, Loader2, Mail, MessageSquare, FileText, Calendar, Monitor, Sparkles } from "lucide-react";
import { EmptyState, PageHeader, TableScroll } from "@/components/AppShell";
import { FetchingBar, TableSkeleton } from "@/components/Skeleton";
import { getEmployeeScoringDetail } from "@/lib/employee-scoring-detail-functions";
import { analyzeEmployeeWorkspaceFocus } from "@/lib/employee-workspace-ai-analysis";
import type { EmployeeWorkspaceAiAnalysis } from "@/lib/employee-workspace-ai-analysis-types";
import type { FocusCluster } from "@/lib/employee-workspace-ai-analysis-types";
import { SCORING_WEIGHTS } from "@/lib/employee-scoring-rules";
import type { WorkspaceActivityItem } from "@/lib/workspace-activity-types";
import { z } from "zod";

const SearchSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

type TabKey = "overview" | "emails" | "chat" | "docs" | "meetings" | "focus" | "ai";

export const Route = createFileRoute("/employee-scoring/$userEmail")({
  head: () => ({ meta: [{ title: "Employee Scoring Detail — Alyson HR" }] }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: EmployeeScoringDetailPage,
});

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function gradeClass(grade: string) {
  switch (grade) {
    case "A":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "B":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "C":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "D":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    default:
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  }
}

function ActivityTable({ items, empty }: { items: WorkspaceActivityItem[]; empty: string }) {
  if (!items.length) {
    return <EmptyState title="No items" description={empty} />;
  }
  return (
    <TableScroll>
      <table className="ops-table w-full">
        <thead>
          <tr>
            <th align="left" className="w-[11rem]">
              When (IST)
            </th>
            <th align="left">Title / subject</th>
            <th align="left">Context</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.at}-${i}`} className="hover:bg-muted/30">
              <td className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtWhen(it.at)}</td>
              <td className="text-[13px] font-medium max-w-md truncate" title={it.title}>
                {it.title}
              </td>
              <td className="text-[12px] text-muted-foreground max-w-sm truncate" title={it.detail}>
                {it.detail ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function EmployeeScoringDetailPage() {
  const { userEmail: encodedEmail } = Route.useParams();
  const search = Route.useSearch();
  const userEmail = decodeURIComponent(encodedEmail);
  const [tab, setTab] = useState<TabKey>("overview");

  const q = useQuery({
    queryKey: ["employee-scoring-detail", userEmail, search.start, search.end],
    queryFn: () =>
      getEmployeeScoringDetail({
        data: { userEmail, start: search.start, end: search.end },
      }),
    placeholderData: keepPreviousData,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const aiQ = useQuery({
    queryKey: ["employee-scoring-ai", userEmail, search.start, search.end],
    queryFn: () =>
      analyzeEmployeeWorkspaceFocus({
        data: {
          userEmail,
          start: search.start,
          end: search.end,
          displayName: q.data?.score?.displayName,
        },
      }),
    enabled: tab === "ai" && !!q.data && !q.isPending,
    staleTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isBusy = q.isFetching;
  const coldLoad = q.isPending && !q.data;
  const data = q.data;
  const score = data?.score;

  const weightLine = useMemo(
    () =>
      `Work ${Math.round(SCORING_WEIGHTS.workHours * 100)}% · Meetings ${Math.round(SCORING_WEIGHTS.meetings * 100)}% · Emails ${Math.round(SCORING_WEIGHTS.emails * 100)}% · Chat ${Math.round(SCORING_WEIGHTS.chat * 100)}% · Docs ${Math.round(SCORING_WEIGHTS.docs * 100)}%`,
    [],
  );

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Mail; count?: number }> = [
    { key: "overview", label: "Overview", icon: Sparkles },
    { key: "emails", label: "Emails", icon: Mail, count: data?.workspace.emails.length },
    { key: "chat", label: "Chat", icon: MessageSquare, count: data?.workspace.chats.length },
    { key: "docs", label: "Docs", icon: FileText, count: data?.workspace.docs.length },
    { key: "meetings", label: "Meetings", icon: Calendar, count: data?.workspace.meetings.length },
    { key: "focus", label: "Time Doctor", icon: Monitor },
    { key: "ai", label: "AI focus", icon: Brain },
  ];

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Employee Scoring"
        title={score?.displayName ?? userEmail.split("@")[0]}
        description={
          score?.linkedEmails && score.linkedEmails.length > 1
            ? `${userEmail} · Merged accounts: ${score.linkedEmails.join(", ")}`
            : `${userEmail} · Scoring detail for selected window`
        }
        actions={
          <Link
            to="/employee-scoring"
            search={{}}
            className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to rankings
          </Link>
        }
      />

      <div className="px-5 md:px-8 py-6 space-y-5">
        <FetchingBar active={isBusy && !coldLoad} />

        {coldLoad ? (
          <TableSkeleton rows={8} />
        ) : q.isError ? (
          <div className="surface-card p-5 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load detail"}
          </div>
        ) : data ? (
          <>
            <div className="surface-card p-4 text-[12px] text-muted-foreground border-l-2 border-l-amber-500/60">
              Subjects, snippets, and chat context come from Google audit logs and optional Gmail delegation.
              Open the <span className="text-foreground font-medium">AI focus</span> tab to cluster themes with Groq
              (requires <span className="font-mono text-[11px]">GROQ_API_KEY</span>).
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <Stat label="Rank" value={score ? `#${score.rank}` : "—"} />
              <Stat label="Grade" value={score?.grade ?? "—"} grade={score?.grade} />
              <Stat label="Score" value={score ? score.compositeScore.toFixed(1) : "—"} />
              <Stat label="Work hrs" value={score ? score.workHours.toFixed(1) : "—"} />
              <Stat label="Emails" value={String(data.workspace.emails.length)} />
              <Stat label="Chat" value={String(data.workspace.chats.length)} />
            </div>

            {data.workspace.focusHints.length ? (
              <div className="surface-card p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">
                  Focus signals
                </div>
                <ul className="text-[13px] space-y-1.5">
                  {data.workspace.focusHints.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={
                      "h-8 px-3 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 " +
                      (active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-paper border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                    {t.count != null ? (
                      <span className={active ? "opacity-80" : "text-muted-foreground"}>({t.count})</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className={isBusy ? "opacity-80 transition-opacity" : ""}>
              {tab === "overview" && (
                <div className="space-y-4">
                  <div className="surface-card p-4 text-[12px] text-muted-foreground">
                    <div className="font-medium text-foreground mb-1">Scoring criteria</div>
                    <p>{weightLine}</p>
                    <p className="mt-2">Percentile mix: {score ? `${score.percentile.workHours}/${score.percentile.meetings}/${score.percentile.emails}/${score.percentile.chat}/${score.percentile.docs}` : "—"}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MiniList title="Recent emails" items={data.workspace.emails.slice(0, 5)} />
                    <MiniList title="Recent docs" items={data.workspace.docs.slice(0, 5)} />
                    <MiniList title="Recent meetings" items={data.workspace.meetings.slice(0, 5)} />
                    <MiniList title="Recent chat" items={data.workspace.chats.slice(0, 5)} />
                  </div>
                </div>
              )}
              {tab === "emails" && (
                <ActivityTable
                  items={data.workspace.emails}
                  empty="No outbound email audit events in this window."
                />
              )}
              {tab === "chat" && (
                <ActivityTable
                  items={data.workspace.chats}
                  empty="No Google Chat message_posted events in this window."
                />
              )}
              {tab === "docs" && (
                <ActivityTable items={data.workspace.docs} empty="No Google Doc create events in this window." />
              )}
              {tab === "meetings" && (
                <ActivityTable
                  items={data.workspace.meetings}
                  empty="No calendar meetings in this window."
                />
              )}
              {tab === "focus" && (
                <div className="space-y-4">
                  {data.timeDoctor.overview ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Stat
                        label="Productive hrs"
                        value={data.timeDoctor.overview.productiveHours.toFixed(1)}
                      />
                      <Stat label="Poor / distracting hrs" value={data.timeDoctor.overview.poorHours.toFixed(1)} />
                      <Stat
                        label="Productivity score"
                        value={`${Math.round(data.timeDoctor.overview.productivityScore * 100)}%`}
                      />
                    </div>
                  ) : null}
                  <div className="surface-card p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-3">
                      Top apps & websites
                    </div>
                    {!data.timeDoctor.topApps.length ? (
                      <p className="text-sm text-muted-foreground">No Time Doctor app breakdown for this user.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.timeDoctor.topApps.map((a) => (
                          <div
                            key={`${a.category}:${a.name}`}
                            className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2"
                          >
                            <div>
                              <div className="text-[13px]">{a.name}</div>
                              <div className="text-[11px] text-muted-foreground">{a.category}</div>
                            </div>
                            <div className="font-mono text-xs">{a.hours.toFixed(2)}h</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {data.timeDoctor.topProjects.length ? (
                    <div className="surface-card p-4">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-3">
                        Projects (Time Doctor)
                      </div>
                      <div className="space-y-2">
                        {data.timeDoctor.topProjects.map((p) => (
                          <div
                            key={p.name}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                          >
                            <span className="text-[13px] truncate">{p.name}</span>
                            <span className="font-mono text-xs">{p.hours.toFixed(2)}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              {tab === "ai" && (
                <AiFocusPanel
                  loading={aiQ.isFetching}
                  error={aiQ.error}
                  analysis={aiQ.data}
                  onRetry={() => void aiQ.refetch()}
                />
              )}
            </div>

            {data.warnings.length ? (
              <div className="surface-card p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">
                  Notes
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {isBusy && !coldLoad ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing detail…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, grade }: { label: string; value: string; grade?: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {grade ? (
        <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-sm font-semibold ${gradeClass(grade)}`}>
          {value}
        </span>
      ) : (
        <div className="font-display text-lg mt-0.5">{value}</div>
      )}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: WorkspaceActivityItem[] }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">{title}</div>
      {!items.length ? (
        <p className="text-[12px] text-muted-foreground">None in window</p>
      ) : (
        <ul className="text-[12px] space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="truncate" title={it.title}>
              <span className="text-muted-foreground">{fmtWhen(it.at)}</span> — {it.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClusterCards({ title, clusters }: { title: string; clusters: FocusCluster[] }) {
  if (!clusters.length) return null;
  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clusters.map((c) => (
          <div key={c.label} className="surface-card p-4 border border-border/80">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-[13px]">{c.label}</div>
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                {c.sharePercent > 0 ? `${c.sharePercent}%` : `${c.count} items`}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1.5">{c.description}</p>
            {c.examples.length ? (
              <ul className="mt-2 text-[11px] text-foreground/90 space-y-1 border-t border-border/60 pt-2">
                {c.examples.map((ex, i) => (
                  <li key={i} className="truncate" title={ex}>
                    “{ex}”
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AiFocusPanel({
  loading,
  error,
  analysis,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  analysis: EmployeeWorkspaceAiAnalysis | undefined;
  onRetry: () => void;
}) {
  if (loading && !analysis) {
    return (
      <div className="surface-card p-8 flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-md">
          Groq is reading emails, chat, docs, meetings, and Time Doctor signals — then clustering by work theme…
        </p>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="surface-card p-5">
        <div className="font-medium text-destructive">AI analysis failed</div>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 h-8 px-3 rounded-md bg-foreground text-background text-xs"
        >
          Retry analysis
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <EmptyState
        title="No analysis yet"
        description="Switch to this tab to run Groq clustering for the selected window."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="surface-card p-4 border-l-2 border-l-violet-500/50">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary focus</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">{analysis.model}</span>
        </div>
        <div className="font-display text-lg">{analysis.primaryFocus}</div>
        <p className="text-[13px] text-muted-foreground mt-2">{analysis.summary}</p>
        {analysis.workThemes.length ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {analysis.workThemes.map((t) => (
              <span
                key={t}
                className="h-6 px-2 rounded-full bg-muted text-[11px] font-medium text-foreground inline-flex items-center"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="text-[11px] text-muted-foreground font-mono">
        Corpus: {analysis.corpusStats.auditEmails} audit emails · {analysis.corpusStats.gmailSnippets} Gmail
        snippets · {analysis.corpusStats.chats} chat · {analysis.corpusStats.docs} docs ·{" "}
        {analysis.corpusStats.meetings} meetings
      </div>

      <ClusterCards title="Email themes" clusters={analysis.emailClusters} />
      <ClusterCards title="Chat themes" clusters={analysis.chatClusters} />
      <ClusterCards title="Document themes" clusters={analysis.docClusters} />
      <ClusterCards title="Meeting themes" clusters={analysis.meetingClusters} />

      {analysis.limitations.length ? (
        <div className="surface-card p-4">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">
            AI limitations
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {analysis.limitations.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing analysis…
        </div>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 px-3 rounded-md border border-border text-xs hover:bg-muted"
        >
          Re-run AI analysis
        </button>
      )}
    </div>
  );
}
