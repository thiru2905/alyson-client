import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { EmptyState, PageHeader, TableScroll } from "@/components/AppShell";
import { FetchingBar, TableSkeleton } from "@/components/Skeleton";
import { WorkspaceActivityRangePicker } from "@/components/WorkspaceActivityRangePicker";
import { getWorkspaceUserActivityDetail } from "@/lib/workspace-activity-functions";
import type { WorkspaceActivityItem } from "@/lib/workspace-activity-types";
import {
  defaultWorkspaceRange,
  fmtWorkspaceRangeLabel,
  fmtWorkspaceWhen,
  isoForInput,
} from "@/lib/workspace-activity-range";
import { toast } from "sonner";
import { z } from "zod";

type TabKey = "overview" | "emails" | "chat" | "docs" | "meetings";

export const Route = createFileRoute("/workspace-activity/$userEmail")({
  head: () => ({ meta: [{ title: "Employee — Workspace Activity — Alyson HR" }] }),
  validateSearch: z
    .object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    })
    .parse,
  component: WorkspaceEmployeeDetailPage,
});

function fmtWhen(iso: string) {
  return fmtWorkspaceWhen(iso);
}

function fmtNum(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function RichActivityTable({
  items,
  kind,
  empty,
}: {
  items: WorkspaceActivityItem[];
  kind: TabKey;
  empty: string;
}) {
  if (!items.length) {
    return <EmptyState title="No items" description={empty} />;
  }

  const showTo = kind === "emails";
  const showRoom = kind === "chat";
  const showLength = kind === "emails" || kind === "chat" || kind === "docs";

  return (
    <TableScroll>
      <table className="ops-table w-full">
        <thead>
          <tr>
            <th align="left" className="w-[10rem]">
              When (IST)
            </th>
            <th align="left">Title / subject</th>
            {showTo ? <th align="left">To</th> : null}
            {showRoom ? <th align="left">Room</th> : null}
            <th align="left" className="w-[5.5rem]">
              Category
            </th>
            {showLength ? (
              <>
                <th align="right" className="w-[4.5rem]">
                  Chars
                </th>
                <th align="right" className="w-[4.5rem]">
                  Words
                </th>
              </>
            ) : null}
            <th align="left">Content preview</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.at}-${i}`} className="align-top hover:bg-muted/25">
              <td className="text-[11px] text-muted-foreground whitespace-nowrap pt-2">{fmtWhen(it.at)}</td>
              <td className="text-[13px] font-medium pt-2 max-w-[14rem]">
                <div className="line-clamp-2" title={it.title}>
                  {it.title}
                </div>
                {it.source ? (
                  <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{it.source}</div>
                ) : null}
              </td>
              {showTo ? (
                <td className="text-[12px] text-muted-foreground pt-2 max-w-[10rem] truncate" title={it.to}>
                  {it.to ?? "—"}
                </td>
              ) : null}
              {showRoom ? (
                <td className="text-[12px] text-muted-foreground pt-2 max-w-[10rem] truncate" title={it.room}>
                  {it.room ?? it.detail ?? "—"}
                </td>
              ) : null}
              <td className="text-[11px] pt-2 capitalize">{it.category ?? "—"}</td>
              {showLength ? (
                <>
                  <td align="right" className="font-mono text-[12px] pt-2">
                    {fmtNum(it.bodyChars)}
                  </td>
                  <td align="right" className="font-mono text-[12px] pt-2">
                    {fmtNum(it.bodyWords)}
                  </td>
                </>
              ) : null}
              <td className="text-[12px] text-muted-foreground pt-2 pb-3 max-w-xl">
                <p className="whitespace-pre-wrap break-words line-clamp-6" title={it.preview ?? it.detail}>
                  {it.preview || (it.detail && !it.detail.startsWith("To: smtp") ? it.detail : "") || it.title || "—"}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function WorkspaceEmployeeDetailPage() {
  const { userEmail: encodedEmail } = Route.useParams();
  const navigate = useNavigate();
  const urlSearch = Route.useSearch();
  const userEmail = decodeURIComponent(encodedEmail);
  const [tab, setTab] = useState<TabKey>("overview");

  const rangeDefaults = useMemo(() => defaultWorkspaceRange(), []);
  const start = urlSearch.start ?? rangeDefaults.start;
  const end = urlSearch.end ?? rangeDefaults.end;

  const [draftStart, setDraftStart] = useState(() => isoForInput(new Date(start)));
  const [draftEnd, setDraftEnd] = useState(() => isoForInput(new Date(end)));

  useEffect(() => {
    setDraftStart(isoForInput(new Date(start)));
    setDraftEnd(isoForInput(new Date(end)));
  }, [start, end]);

  const applyRange = () => {
    const s = new Date(draftStart);
    const e = new Date(draftEnd);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) {
      toast.error("Invalid datetime range");
      return;
    }
    if (s.getTime() >= e.getTime()) {
      toast.error("Start must be before end");
      return;
    }
    const next = { start: s.toISOString(), end: e.toISOString() };
    if (next.start === start && next.end === end) {
      void q.refetch();
      return;
    }
    navigate({
      to: "/workspace-activity/$userEmail",
      params: { userEmail: encodedEmail },
      search: next,
      replace: true,
    });
  };

  const listSearch = { start, end };

  const q = useQuery({
    queryKey: ["workspace-employee-detail", userEmail, start, end],
    queryFn: () =>
      getWorkspaceUserActivityDetail({
        data: { userEmail, start, end },
      }),
    enabled: !!userEmail && !!start && !!end,
    placeholderData: keepPreviousData,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const draftRange = useMemo(() => {
    const s = new Date(draftStart);
    const e = new Date(draftEnd);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return null;
    return { start: s.toISOString(), end: e.toISOString() };
  }, [draftStart, draftEnd]);
  const draftMatchesApplied = draftRange?.start === start && draftRange?.end === end;
  const isBusy = q.isFetching;
  const showingStaleRange = q.isPlaceholderData && isBusy;
  const coldLoad = q.isPending && !q.data;
  const data = q.data;

  const lastToastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!q.isSuccess || q.isPlaceholderData || !q.data) return;
    const key = `${start}:${end}`;
    if (lastToastKey.current === key) return;
    if (lastToastKey.current !== null) toast.success("Workspace detail updated");
    lastToastKey.current = key;
  }, [q.isSuccess, q.isPlaceholderData, q.data, start, end]);

  const tabLabel =
    tab === "overview"
      ? "Overview"
      : tab === "emails"
        ? "Emails"
        : tab === "chat"
          ? "Chat"
          : tab === "docs"
            ? "Docs"
            : "Meetings";

  const statusBanner = (() => {
    if (coldLoad) {
      return {
        tone: "loading" as const,
        text: `Loading ${tabLabel} from Google Workspace — emails, chat, and docs can take 30–60 seconds.`,
      };
    }
    if (showingStaleRange) {
      return {
        tone: "loading" as const,
        text: `Updating ${fmtWorkspaceRangeLabel(start, end)} — previous ${tabLabel.toLowerCase()} stays visible until ready.`,
      };
    }
    if (isBusy) return { tone: "loading" as const, text: `Refreshing ${tabLabel.toLowerCase()}…` };
    if (q.isError && !data) {
      return {
        tone: "error" as const,
        text: q.error instanceof Error ? q.error.message : "Failed to load workspace detail",
      };
    }
    return null;
  })();

  return (
    <div className="ops-dense min-h-[50vh]">
      <PageHeader
        eyebrow="Operations"
        title={userEmail.split("@")[0]}
        description={`${userEmail} · Workspace detail · ${fmtWorkspaceRangeLabel(start, end)}`}
        dense
        actions={
          <>
            <Link
              to="/workspace-activity"
              search={listSearch}
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <WorkspaceActivityRangePicker
              draftStart={draftStart}
              draftEnd={draftEnd}
              onStartChange={setDraftStart}
              onEndChange={setDraftEnd}
              onApply={applyRange}
              compact
              isBusy={isBusy}
              draftMatchesApplied={draftMatchesApplied}
            />
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={isBusy}
              className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="inline-flex rounded-md border border-border p-0.5 bg-paper">
              {(
                [
                  ["overview", "Overview"],
                  ["emails", "Emails"],
                  ["chat", "Chat"],
                  ["docs", "Docs"],
                  ["meetings", "Meetings"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={
                    "h-7 px-2.5 rounded text-[11px] font-medium " +
                    (tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="px-5 md:px-8 py-6 space-y-5">
        <FetchingBar active={isBusy && !coldLoad} />

        {statusBanner ? (
          <div
            className={
              "rounded-md border px-3 py-2.5 text-[12px] flex items-center gap-2 " +
              (statusBanner.tone === "error"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border bg-muted/40 text-foreground")
            }
            role="status"
          >
            {statusBanner.tone === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
            <span>{statusBanner.text}</span>
          </div>
        ) : null}

        {coldLoad ? (
          <TableSkeleton rows={10} />
        ) : q.isError && !data ? (
          <div className="surface-card p-5 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load employee detail"}
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="mt-3 block h-8 px-3 rounded-md border border-destructive/30 text-xs"
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            <div className="surface-card p-4 text-[12px] text-muted-foreground border-l-2 border-l-sky-500/50">
              {data.gmailEnriched ? (
                <span className="text-foreground font-medium">Gmail body</span>
              ) : (
                <span className="text-foreground font-medium">Audit-only emails</span>
              )}{" "}
              — subjects and lengths from{" "}
              {data.gmailEnriched ? "Gmail API (domain-wide delegation)" : "Workspace audit (no full body)"}.{" "}
              {data.docsEnriched ? (
                <span className="text-foreground font-medium">Docs content</span>
              ) : (
                <span>Docs</span>
              )}{" "}
              {data.docsEnriched ? "include word counts from Google Docs API." : "show audit titles only unless Docs API access works."}{" "}
              {data.chatEnriched ? (
                <span className="text-foreground font-medium">Chat body</span>
              ) : (
                <span className="text-foreground font-medium">Audit-only chat</span>
              )}{" "}
              —{" "}
              {data.chatEnriched
                ? "message text from Chat API (domain-wide delegation)."
                : "audit counts room/title only unless chat.messages.readonly is delegated."}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              <Stat label="Emails" value={String(data.stats.emails.count)} sub={`avg ${fmtNum(data.stats.emails.avgBodyChars)} chars`} />
              <Stat label="Chat" value={String(data.stats.chats.count)} sub={`avg ${fmtNum(data.stats.chats.avgBodyChars)} chars`} />
              <Stat
                label="Docs"
                value={String(data.stats.docs.count)}
                sub={`${fmtNum(data.stats.docs.totalWords)} words total`}
              />
              <Stat label="Meetings" value={String(data.stats.meetings.count)} />
              <Stat
                label="Email volume"
                value={fmtNum(data.stats.emails.totalBodyChars)}
                sub="chars sent (window)"
              />
            </div>

            {data.focusHints.length ? (
              <div className="surface-card p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">
                  Focus signals
                </div>
                <ul className="text-[13px] space-y-1.5">
                  {data.focusHints.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="surface-card p-3 text-[12px] text-muted-foreground">
              {showingStaleRange ? <span className="font-medium text-foreground">Pending range · </span> : null}
              {tabLabel} · {data.emails.length} emails · {data.chats.length} chat · {data.docs.length} docs ·{" "}
              {data.meetings.length} meetings
            </div>

            <div className={isBusy && !showingStaleRange ? "opacity-90 transition-opacity" : ""}>
              {tab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <PreviewList title="Recent emails" items={data.emails.slice(0, 6)} />
                  <PreviewList title="Recent chat" items={data.chats.slice(0, 6)} />
                  <PreviewList title="Recent docs" items={data.docs.slice(0, 6)} />
                  <PreviewList title="Recent meetings" items={data.meetings.slice(0, 6)} />
                </div>
              )}
              {tab === "emails" && (
                <RichActivityTable
                  items={data.emails}
                  kind="emails"
                  empty="No sent emails in this window (check Gmail delegation or try a wider range)."
                />
              )}
              {tab === "chat" && (
                <RichActivityTable
                  items={data.chats}
                  kind="chat"
                  empty="No chat messages in this window (enable Chat API delegation for full text, or widen the range)."
                />
              )}
              {tab === "docs" && (
                <RichActivityTable
                  items={data.docs}
                  kind="docs"
                  empty="No Google Docs created in this window."
                />
              )}
              {tab === "meetings" && (
                <RichActivityTable
                  items={data.meetings}
                  kind="meetings"
                  empty="No calendar meetings in this window."
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg mt-0.5">{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div> : null}
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: WorkspaceActivityItem[] }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">{title}</div>
      {!items.length ? (
        <p className="text-[12px] text-muted-foreground">None in window</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="text-[12px] border-b border-border/50 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-foreground line-clamp-1">{it.title}</span>
                <span className="text-muted-foreground shrink-0">{fmtWhen(it.at)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                {it.category ?? "general"}
                {it.bodyChars != null ? ` · ${it.bodyChars} chars` : ""}
                {it.bodyWords != null ? ` · ${it.bodyWords} words` : ""}
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-3">{it.preview ?? it.detail ?? "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
