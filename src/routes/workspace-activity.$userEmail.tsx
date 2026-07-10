import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import { EmptyState, PageHeader, TableScroll } from "@/components/AppShell";
import { FetchingBar, TableSkeleton } from "@/components/Skeleton";
import { WorkspaceActivityRangePicker, workspacePresetRange } from "@/components/WorkspaceActivityRangePicker";
import {
  getWorkspaceActivityEmailBody,
  getWorkspaceActivityItemInsight,
  getWorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-functions";
import type { WorkspaceActivityEmailBodyResult, WorkspaceActivityItem } from "@/lib/workspace-activity-types";
import {
  defaultWorkspaceRange,
  fmtWorkspaceRangeLabel,
  fmtWorkspaceWhen,
  isoForInput,
} from "@/lib/workspace-activity-range";
import { toast } from "sonner";
import { z } from "zod";
import { SuperAccessGate } from "@/components/SuperAccessGate";
import { useSuperAccessAuth } from "@/lib/super-access-rbac-hooks";

type TabKey = "overview" | "emails" | "chat" | "docs" | "meetings";

const RANGE_PRESETS = [1, 7, 30] as const;

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

function WorkspaceEmployeeDetailPage() {
  return (
    <SuperAccessGate moduleLabel="Workspace Activity">
      <WorkspaceEmployeeDetailPageContent />
    </SuperAccessGate>
  );
}

function fmtWhen(iso: string) {
  return fmtWorkspaceWhen(iso);
}

function fmtNum(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function previewText(it: WorkspaceActivityItem) {
  return it.preview || (it.detail && !it.detail.startsWith("To: smtp") ? it.detail : "") || it.title || "";
}

type InsightKind = "doc" | "email" | "chat";

function insightKindFromTab(tab: TabKey): InsightKind | null {
  if (tab === "docs") return "doc";
  if (tab === "emails") return "email";
  if (tab === "chat") return "chat";
  return null;
}

const CHAT_AUDIT_FLAG_RE =
  /^(DLP_|EPHEMERAL_|PERMANENT|REGULAR_MESSAGE|NO_ATTACHMENT|HAS_ATTACHMENT|VIDEO_MESSAGE|VOICE_MESSAGE|HUDDLE)/i;

function isMostlyChatAuditFlags(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const flags = tokens.filter((t) => CHAT_AUDIT_FLAG_RE.test(t.replace(/\s+/g, "_")));
  return flags.length >= Math.max(2, tokens.length - 1);
}

function gmailMessageIdFromItem(item: WorkspaceActivityItem): string | null {
  const m = item.meta;
  if (!m) return null;
  return m.gmail_id || m.message_id || m.gmail_message_id || m.msg_id || null;
}

function canOpenContentModal(kind: InsightKind, item: WorkspaceActivityItem) {
  const text = previewText(item);
  if (!text.trim()) return false;
  if (kind === "email") return true;
  return canInsightPreview(kind, item);
}

function canInsightPreview(kind: InsightKind, item: WorkspaceActivityItem) {
  const text = previewText(item);
  if (!text.trim() || text.length < 12) return false;
  if (/body text not available/i.test(text)) return false;

  if (kind === "doc") return true;

  if (kind === "email") {
    if (text.startsWith("To: smtp") && !/[a-zA-Z]{8,}/.test(text)) return false;
    return true;
  }

  if (kind === "chat") {
    if (item.source === "chat") return true;
    if (isMostlyChatAuditFlags(text)) return false;
    if (/^posted in /i.test(text) && text.length < 100) return false;
    return /[a-zA-Z]{4,}/.test(text);
  }

  return false;
}

const INSIGHT_LABELS: Record<
  InsightKind,
  { modalTitle: string; loading: string; footer: string; ariaId: string }
> = {
  doc: {
    modalTitle: "Document insight",
    loading: "Groq is summarizing this document…",
    footer: "AI summary from preview text — verify in Google Docs if needed.",
    ariaId: "doc-insight-title",
  },
  email: {
    modalTitle: "Email insight",
    loading: "Groq is summarizing this email…",
    footer: "AI summary from subject and preview — verify in Gmail if needed.",
    ariaId: "email-insight-title",
  },
  chat: {
    modalTitle: "Chat insight",
    loading: "Groq is summarizing this message…",
    footer: "AI summary from message preview — verify in Google Chat if needed.",
    ariaId: "chat-insight-title",
  },
};

function ContentPreviewInsight({
  item,
  userEmail,
  rangeLabel,
  insightKind,
}: {
  item: WorkspaceActivityItem;
  userEmail: string;
  rangeLabel: string;
  insightKind: InsightKind;
}) {
  const superAuth = useSuperAccessAuth();
  const text = previewText(item);
  const labels = INSIGHT_LABELS[insightKind];
  const canOpen = canOpenContentModal(insightKind, item);
  const canSummarize = canInsightPreview(insightKind, item);
  const isEmail = insightKind === "email";
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"summary" | "full">("summary");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [fullBody, setFullBody] = useState<WorkspaceActivityEmailBodyResult | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const fullCacheRef = useRef(new Map<string, WorkspaceActivityEmailBodyResult>());

  const cacheKey = `${item.at}|${item.title}`;
  const fullCacheKey = `${cacheKey}|${gmailMessageIdFromItem(item) ?? "preview"}`;

  const loadInsight = async () => {
    if (!canSummarize) return;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSummary(cached);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const previewForApi =
        isEmail && item.title && !text.toLowerCase().includes(item.title.toLowerCase().slice(0, 24))
          ? `Subject: ${item.title}\n\n${text}`
          : text;
      const auth = await superAuth();
      const r = await getWorkspaceActivityItemInsight({
        data: {
          ...auth,
          kind: insightKind,
          title: item.title,
          preview: previewForApi,
          at: item.at,
          userEmail,
          rangeLabel,
        },
      });
      cacheRef.current.set(cacheKey, r.summary);
      setSummary(r.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate summary");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const loadFullEmail = async () => {
    const cached = fullCacheRef.current.get(fullCacheKey);
    if (cached) {
      setFullBody(cached);
      setFullError(null);
      setPanel("full");
      return;
    }
    setFullLoading(true);
    setFullError(null);
    try {
      const auth = await superAuth();
      const r = await getWorkspaceActivityEmailBody({
        data: {
          ...auth,
          userEmail,
          messageId: gmailMessageIdFromItem(item) ?? undefined,
          title: item.title,
          preview: text,
          at: item.at,
        },
      });
      fullCacheRef.current.set(fullCacheKey, r);
      setFullBody(r);
      setPanel("full");
    } catch (e) {
      setFullError(e instanceof Error ? e.message : "Failed to load email body");
    } finally {
      setFullLoading(false);
    }
  };

  const onOpen = () => {
    setOpen(true);
    setPanel("summary");
    if (canSummarize) void loadInsight();
  };

  const closeModal = () => {
    setOpen(false);
    setPanel("summary");
  };

  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      {canOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="text-left w-full rounded-md px-1 -mx-1 py-0.5 hover:bg-primary/10 hover:text-foreground transition-colors group"
          title={isEmail ? "Click to view email details" : "Click for AI summary (Groq)"}
        >
          <p className="whitespace-pre-wrap break-words line-clamp-6">{text}</p>
          <span className="inline-flex items-center gap-1 text-[10px] text-primary/80 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isEmail ? <Mail className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {isEmail ? "View" : "Summarize"}
          </span>
        </button>
      ) : (
        <p className="whitespace-pre-wrap break-words line-clamp-6" title={text}>
          {text}
        </p>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labels.ariaId}
          onClick={closeModal}
        >
          <div
            className="surface-card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div
                  id={labels.ariaId}
                  className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium"
                >
                  {isEmail ? "Email details" : labels.modalTitle}
                </div>
                <h3 className="text-[15px] font-medium mt-1 leading-snug">{item.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {fmtWhen(item.at)} · {rangeLabel}
                  {item.to ? ` · To: ${item.to}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="h-8 w-8 rounded-md border border-border flex items-center justify-center shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isEmail ? (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {canSummarize ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPanel("summary");
                      if (!summary && !loading) void loadInsight();
                    }}
                    className={
                      "h-7 px-2.5 rounded text-[11px] font-medium border " +
                      (panel === "summary"
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    AI summary
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void loadFullEmail()}
                  disabled={fullLoading}
                  className={
                    "h-7 px-2.5 rounded text-[11px] font-medium border inline-flex items-center gap-1.5 " +
                    (panel === "full"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {fullLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                  Read entire email
                </button>
              </div>
            ) : null}

            {panel === "full" && isEmail ? (
              fullLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading full email from Gmail…
                </div>
              ) : fullError ? (
                <p className="text-[13px] text-destructive">{fullError}</p>
              ) : fullBody ? (
                <div className="space-y-3">
                  {fullBody.from ? (
                    <p className="text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">From:</span> {fullBody.from}
                    </p>
                  ) : null}
                  {fullBody.to ? (
                    <p className="text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">To:</span> {fullBody.to}
                    </p>
                  ) : null}
                  {fullBody.cc ? (
                    <p className="text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">Cc:</span> {fullBody.cc}
                    </p>
                  ) : null}
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap border border-border/60 rounded-md p-3 bg-muted/20 max-h-[50vh] overflow-y-auto">
                    {fullBody.body}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {fullBody.source === "gmail"
                      ? "Full message from Gmail API."
                      : "Audit/preview only — Gmail delegation may be required for the complete body."}
                  </p>
                </div>
              ) : null
            ) : (
              <>
                <div className="text-[11px] text-muted-foreground mb-3 p-2 rounded-md bg-muted/40 border border-border/60 max-h-24 overflow-y-auto">
                  {text.slice(0, 400)}
                  {text.length > 400 ? "…" : ""}
                </div>

                {!canSummarize ? (
                  <p className="text-[13px] text-muted-foreground">
                    Preview only — use &ldquo;Read entire email&rdquo; for the full message when available.
                  </p>
                ) : loading ? (
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {labels.loading}
                  </div>
                ) : error ? (
                  <p className="text-[13px] text-destructive">{error}</p>
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{summary}</div>
                )}

                {isEmail && canSummarize ? (
                  <button
                    type="button"
                    onClick={() => void loadFullEmail()}
                    disabled={fullLoading}
                    className="mt-4 h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
                  >
                    {fullLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Read entire email
                  </button>
                ) : null}

                <p className="text-[10px] text-muted-foreground mt-4">{labels.footer}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function RichActivityTable({
  items,
  kind,
  empty,
  userEmail,
  rangeLabel,
}: {
  items: WorkspaceActivityItem[];
  kind: TabKey;
  empty: string;
  userEmail: string;
  rangeLabel: string;
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
                {insightKindFromTab(kind) ? (
                  <ContentPreviewInsight
                    item={it}
                    userEmail={userEmail}
                    rangeLabel={rangeLabel}
                    insightKind={insightKindFromTab(kind)!}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words line-clamp-6" title={previewText(it)}>
                    {previewText(it) || "—"}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function WorkspaceEmployeeDetailPageContent() {
  const superAuth = useSuperAccessAuth();
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

  const applyPreset = (days: number) => {
    const preset = workspacePresetRange(days);
    setDraftStart(preset.draftStart);
    setDraftEnd(preset.draftEnd);
    const next = {
      start: new Date(preset.draftStart).toISOString(),
      end: new Date(preset.draftEnd).toISOString(),
    };
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
  const rangeLabel = useMemo(() => fmtWorkspaceRangeLabel(start, end), [start, end]);

  const q = useQuery({
    queryKey: ["workspace-employee-detail", userEmail, start, end],
    queryFn: async () => {
      const auth = await superAuth();
      return getWorkspaceUserActivityDetail({
        data: { ...auth, userEmail, start, end },
      });
    },
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

  const tabDefs = useMemo(
    () =>
      [
        ["overview", "Overview"],
        ["emails", `Emails (${data?.emails.length ?? 0})`],
        ["chat", `Chat (${data?.chats.length ?? 0})`],
        ["docs", `Docs (${data?.docs.length ?? 0})`],
        ["meetings", `Meetings (${data?.meetings.length ?? 0})`],
      ] as const,
    [data?.chats.length, data?.docs.length, data?.emails.length, data?.meetings.length],
  );

  const statusBanner = (() => {
    if (coldLoad) {
      return {
        tone: "loading" as const,
        text: `Loading workspace activity for ${fmtWorkspaceRangeLabel(start, end)} — this can take 30–60 seconds.`,
      };
    }
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
              onPreset={applyPreset}
              presetDays={RANGE_PRESETS}
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
              {tabDefs.map(([key, label]) => (
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

      <div className="app-page-gutter py-6 space-y-5">
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
            {tab === "overview" ? (
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
            ) : null}

            {tab === "overview" && data.focusHints.length ? (
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

            <div className={isBusy && !showingStaleRange ? "opacity-90 transition-opacity" : ""}>
              {tab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <PreviewList title="Recent emails" items={data.emails.slice(0, 5)} onOpenTab={() => setTab("emails")} />
                  <PreviewList title="Recent chat" items={data.chats.slice(0, 5)} onOpenTab={() => setTab("chat")} />
                  <PreviewList title="Recent docs" items={data.docs.slice(0, 5)} onOpenTab={() => setTab("docs")} />
                  <PreviewList title="Recent meetings" items={data.meetings.slice(0, 5)} onOpenTab={() => setTab("meetings")} />
                </div>
              )}
              {tab === "emails" && (
                <RichActivityTable
                  items={data.emails}
                  kind="emails"
                  empty="No sent emails in this window (check Gmail delegation or try a wider range)."
                  userEmail={userEmail}
                  rangeLabel={rangeLabel}
                />
              )}
              {tab === "chat" && (
                <RichActivityTable
                  items={data.chats}
                  kind="chat"
                  empty="No chat messages in this window (enable Chat API delegation for full text, or widen the range)."
                  userEmail={userEmail}
                  rangeLabel={rangeLabel}
                />
              )}
              {tab === "docs" && (
                <RichActivityTable
                  items={data.docs}
                  kind="docs"
                  empty="No Google Docs created in this window."
                  userEmail={userEmail}
                  rangeLabel={rangeLabel}
                />
              )}
              {tab === "meetings" && (
                <RichActivityTable
                  items={data.meetings}
                  kind="meetings"
                  empty="No calendar meetings in this window."
                  userEmail={userEmail}
                  rangeLabel={rangeLabel}
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

function PreviewList({
  title,
  items,
  onOpenTab,
}: {
  title: string;
  items: WorkspaceActivityItem[];
  onOpenTab?: () => void;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{title}</div>
        {onOpenTab && items.length ? (
          <button type="button" onClick={onOpenTab} className="text-[10px] text-primary hover:underline">
            View all
          </button>
        ) : null}
      </div>
      {!items.length ? (
        <p className="text-[12px] text-muted-foreground">None in window</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-[12px] border-b border-border/50 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-foreground line-clamp-1">{it.title}</span>
                <span className="text-muted-foreground shrink-0">{fmtWhen(it.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
