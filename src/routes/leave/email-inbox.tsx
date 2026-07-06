import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { FetchingBar } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import {
  getLeaveEmailInbox,
  retryAllFailedLeaveEmailExtractions,
  retryLeaveEmailExtraction,
  scanLeaveEmailInbox,
} from "@/lib/leave-email-functions";
import type { LeaveEmailQueueItem } from "@/lib/leave-email-schema";
import type { LeaveEmailScanPeriod } from "@/lib/leave-email-sync.server";

const SCAN_OPTIONS: { value: LeaveEmailScanPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6mo", label: "Last 6 months" },
  { value: "12mo", label: "Last 12 months" },
  { value: "24mo", label: "Last 24 months (slow)" },
];

export const Route = createFileRoute("/leave/email-inbox")({
  component: LeaveEmailInboxPage,
});

const QUERY_KEY = ["leave-email-inbox"];

function LeaveEmailInboxPage() {
  const auth = useAuth();
  const canEdit = auth.hasAnyRole(["super_admin", "ceo", "hr"]);
  const actor = auth.user?.email ?? null;
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "leave">("all");
  const [scanPeriod, setScanPeriod] = useState<LeaveEmailScanPeriod>("30d");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getLeaveEmailInbox(),
    refetchInterval: 60_000,
  });

  const scanM = useMutation({
    mutationFn: (period: LeaveEmailScanPeriod) =>
      scanLeaveEmailInbox({ data: { actor, period } }),
    onSuccess: (r) => {
      if (r.errors.length) {
        toast.warning(`Scan done with ${r.errors.length} issue(s) — ${r.scanned} scanned, ${r.applied} applied`);
      } else {
        toast.success(`Scanned ${r.scanned} — ${r.applied} applied, ${r.duplicates} already on ledger`);
      }
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-ledger"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  });

  const retryM = useMutation({
    mutationFn: (queueItemId: string) =>
      retryLeaveEmailExtraction({ data: { actor, queueItemId } }),
    onMutate: (queueItemId) => setRetryingId(queueItemId),
    onSettled: () => setRetryingId(null),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          r.applied
            ? "DeepSeek extraction succeeded — leave applied to ledger"
            : "DeepSeek extraction succeeded",
        );
      } else {
        toast.error(r.error ?? "Extraction still failed");
      }
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-ledger"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const retryAllM = useMutation({
    mutationFn: () => retryAllFailedLeaveEmailExtractions({ data: { actor } }),
    onSuccess: (r) => {
      if (r.errors.length) {
        toast.warning(
          `Retried ${r.retried} — ${r.succeeded} succeeded, ${r.applied} applied, ${r.errors.length} still failing`,
        );
      } else if (r.retried === 0) {
        toast.message("No failed extractions to retry");
      } else {
        toast.success(`Retried ${r.retried} — ${r.succeeded} succeeded, ${r.applied} applied`);
      }
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-ledger"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry all failed"),
  });

  const isBusy = scanM.isPending || retryM.isPending || retryAllM.isPending;

  const items = useMemo(() => {
    const all = q.data?.allEmails ?? [];
    if (filter === "leave") return q.data?.leaveRequests ?? [];
    return all;
  }, [q.data?.allEmails, q.data?.leaveRequests, filter]);

  const stats = q.data?.stats;

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="font-medium text-[13px] flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            People Ops email inbox
          </div>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-2xl">
            Leave requests from{" "}
            <span className="font-mono text-foreground">{q.data?.mailbox ?? "people-ops@cintara.ai"}</span>{" "}
            are parsed by DeepSeek and applied automatically to the leave ledger and team calendar when the
            employee and dates match. Manual entries you added are never overwritten — overlapping leave is
            skipped as &quot;already on ledger&quot;.
          </p>
          {stats ? (
            <div className="flex flex-wrap gap-3 mt-3 text-[12px]">
              <Stat label="All emails" value={stats.totalEmails} />
              <Stat label="Leave emails" value={stats.totalLeaveEmails} />
              <Stat label="Applied" value={stats.applied} />
              <Stat label="Already on ledger" value={stats.alreadyOnLedger} />
              <Stat label="Unmatched" value={stats.unmatched} />
              {(stats.extractionFailed ?? 0) > 0 ? (
                <Stat label="Extraction failed" value={stats.extractionFailed ?? 0} />
              ) : null}
            </div>
          ) : null}
          {q.data?.mailboxProbe && !q.data.mailboxProbe.ok ? (
            <div className="mt-2 text-[12px] text-red-600 bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2">
              Cannot read mail for {q.data.mailboxProbe.mailbox}: {q.data.mailboxProbe.error}
              <div className="mt-1 text-[11px] opacity-90">
                Reading as {q.data.mailboxProbe.impersonateUser} ({q.data.mailboxProbe.mode}). If this persists, add{" "}
                <span className="font-mono">gmail.readonly</span> to Google Admin → Domain-wide delegation for your
                service account client ID.
              </div>
            </div>
          ) : null}
          {q.data?.mailboxProbe?.ok ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Gmail via {q.data.mailboxProbe.impersonateUser} ({q.data.mailboxProbe.mode}) · filtering{" "}
              {q.data.mailbox}
            </div>
          ) : null}
          {q.data?.syncState?.lastError ? (
            <div className="mt-2 text-[12px] text-amber-800 dark:text-amber-200">
              Last error: {q.data.syncState.lastError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
            <StatusPill ok={q.data?.mailboxProbe?.ok} label={`Mailbox (${q.data?.mailboxProbe?.recentCount ?? 0} recent)`} />
            <StatusPill ok={q.data?.syncEnabled} label="Auto sync" />
            {q.data?.syncState?.lastSyncAt ? (
              <span>Last sync: {new Date(q.data.syncState.lastSyncAt).toLocaleString()}</span>
            ) : null}
            {q.data?.syncState?.lastBackfillThrough ? (
              <span>Last backfill: {new Date(q.data.syncState.lastBackfillThrough).toLocaleString()}</span>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden shadow-sm self-end">
              <select
                value={scanPeriod}
                onChange={(e) => setScanPeriod(e.target.value as LeaveEmailScanPeriod)}
                disabled={isBusy}
                aria-label="Scan period"
                className="h-8 border-0 border-r border-border bg-background text-foreground text-xs font-medium px-2.5 min-w-[9.5rem] outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50 cursor-pointer"
              >
                {SCAN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => scanM.mutate(scanPeriod)}
                disabled={isBusy}
                className="h-8 px-3 bg-foreground text-background text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                {scanM.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Scan mail
              </button>
            </div>
            {(stats?.extractionFailed ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => retryAllM.mutate()}
                disabled={isBusy}
                className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center justify-center gap-1.5 self-end whitespace-nowrap"
              >
                {retryAllM.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Retry failed ({stats?.extractionFailed ?? 0})
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          All emails ({q.data?.allEmails?.length ?? 0})
        </FilterBtn>
        <FilterBtn active={filter === "leave"} onClick={() => setFilter("leave")}>
          Leave only ({q.data?.leaveRequests?.length ?? 0})
        </FilterBtn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-stretch">
        <div className="xl:col-span-2 flex flex-col min-h-[min(72vh,720px)]">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1 h-6 flex items-center mb-2">
            {filter === "all" ? "All mail" : "Leave requests"} ({items.length})
          </div>
          <div className="surface-card border border-border rounded-lg flex-1 flex flex-col min-h-0 overflow-hidden">
            {items.length === 0 ? (
              <div className="flex-1 grid place-items-center p-8 text-center text-[13px] text-muted-foreground">
                {scanM.isPending || q.isFetching
                  ? "Scanning mail…"
                  : "No emails yet. Pick a range and click Scan mail."}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {items.map((item) => (
                  <QueueListItem
                    key={item.id}
                    item={item}
                    active={selected?.id === item.id}
                    onClick={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-3 flex flex-col min-h-[min(72vh,720px)]">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1 h-6 flex items-center mb-2">
            Details
          </div>
          <div className="surface-card border border-border rounded-lg flex-1 min-h-0 overflow-y-auto">
            {selected ? (
              <DetailPanel
                item={selected}
                canRetry={canEdit}
                isRetrying={retryingId === selected.id}
                onRetry={() => retryM.mutate(selected.id)}
              />
            ) : (
              <div className="h-full min-h-[200px] grid place-items-center text-muted-foreground text-[13px] p-10 text-center">
                Select an email to view extraction details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${
        ok ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-8 px-3 rounded-md text-[12px] font-medium border transition-colors " +
        (active ? "bg-muted border-border text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60")
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-muted-foreground">{label}</span>{" "}
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </span>
  );
}

function QueueListItem({
  item,
  active,
  onClick,
}: {
  item: LeaveEmailQueueItem;
  active: boolean;
  onClick: () => void;
}) {
  const ext = item.extraction;
  const tone = ext?.tone.label;
  const conf = ext?.confidence;
  const employee =
    item.matchedEmployeeName ||
    ext?.employee.name ||
    item.fromName;
  const dates =
    ext?.leave.startDate && ext?.leave.endDate
      ? `${fmtDate(ext.leave.startDate)} – ${fmtDate(ext.leave.endDate)}`
      : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md border p-3 transition-colors ${
        active ? "border-foreground/30 bg-muted/30" : "border-border bg-background hover:bg-muted/20"
      }`}
    >
      <div className="font-medium text-[13px] truncate">
        {employee}
        {dates ? <span className="text-muted-foreground font-normal"> · {dates}</span> : null}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
        {item.subject || "(no subject)"} · {new Date(item.receivedAt).toLocaleDateString()}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <Badge status={item.status} />
        {item.status === "duplicate" ? (
          <span className="text-[10px] text-muted-foreground">kept your manual entry</span>
        ) : null}
        {item.salaryDeductionRisk ? <span className="text-[10px] text-red-600 font-medium">Over limit risk</span> : null}
        {tone ? <span className="text-[10px] text-muted-foreground capitalize">{tone}</span> : null}
        {conf != null ? (
          <span className="text-[10px] text-muted-foreground">{Math.round(conf * 100)}% conf</span>
        ) : null}
        {item.source === "backfill" ? (
          <span className="text-[10px] text-muted-foreground">backfill</span>
        ) : null}
      </div>
    </button>
  );
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-sky-500/15 text-sky-800",
    approved: "bg-emerald-500/15 text-emerald-900",
    unmatched: "bg-amber-500/15 text-amber-900",
    extraction_failed: "bg-red-500/15 text-red-800",
    duplicate: "bg-violet-500/15 text-violet-900",
    not_leave: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    duplicate: "already on ledger",
    not_leave: "not leave",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[status] ?? "bg-muted"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

function DetailPanel({
  item,
  canRetry,
  isRetrying,
  onRetry,
}: {
  item: LeaveEmailQueueItem;
  canRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
}) {
  const ext = item.extraction;
  const isCancellation = ext?.leave.isCancellation ?? false;
  const isLeave = ext?.isLeaveRequest ?? false;
  const showRetry = canRetry && item.status === "extraction_failed" && onRetry;

  return (
    <div className="divide-y divide-border">
      <div className="p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-medium text-[15px] min-w-0 flex-1">{item.subject}</h2>
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Retry DeepSeek
            </button>
          ) : null}
        </div>
        <div className="text-[12px] text-muted-foreground">
          From {item.fromName} &lt;{item.fromEmail}&gt; · {new Date(item.receivedAt).toLocaleString()}
        </div>
        {ext ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-muted capitalize">{ext.tone.label}</span>
            <span className="text-muted-foreground">{ext.tone.summary}</span>
            <span className="text-muted-foreground">· {Math.round(ext.confidence * 100)}% confidence</span>
          </div>
        ) : null}
        {item.extractionError ? (
          <div className="text-[12px] text-red-600">Extraction failed: {item.extractionError}</div>
        ) : null}
        {item.status === "duplicate" ? (
          <div className="text-[12px] text-violet-800 dark:text-violet-300 bg-violet-500/10 border border-violet-500/25 rounded-md px-3 py-2">
            Leave for {item.matchedEmployeeName || "this employee"} on these dates already exists on the
            ledger (e.g. entered manually). Email was logged but not duplicated.
          </div>
        ) : null}
        {item.matchedEmployeeName ? (
          <div className="text-[12px] text-foreground">
            Ledger: <span className="font-medium">{item.matchedEmployeeName}</span>
            {item.linkedLeaveEventId ? (
              <span className="text-muted-foreground"> · event {item.linkedLeaveEventId.slice(0, 12)}…</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Section title="Email body">
            <pre className="text-[11px] whitespace-pre-wrap font-sans text-muted-foreground max-h-48 overflow-y-auto">
              {item.bodyText || item.bodySnippet}
            </pre>
          </Section>
          {ext?.warnings?.length ? (
            <Section title="Warnings">
              <ul className="text-[12px] text-amber-800 dark:text-amber-200 space-y-1 list-disc pl-4">
                {ext.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <div className="space-y-3">
          <Section title="DeepSeek extraction">
            {ext ? (
              <dl className="text-[12px] space-y-1.5">
                <Row label="Leave request" value={isLeave ? "Yes" : "No"} />
                <Row label="Cancellation" value={isCancellation ? "Yes" : "No"} />
                <Row label="Ledger match" value={item.matchedEmployeeName || "—"} />
                <Row
                  label="Email says"
                  value={`${ext.employee.name}${ext.employee.email ? ` · ${ext.employee.email}` : ""}`}
                />
                <Row label="Matched from" value={ext.employee.matchedFrom.replace(/_/g, " ")} />
                <Row label="Type" value={ext.leave.leaveType} />
                <Row
                  label="Dates"
                  value={
                    ext.leave.startDate && ext.leave.endDate
                      ? `${fmtDate(ext.leave.startDate)} – ${fmtDate(ext.leave.endDate)}`
                      : "—"
                  }
                />
                <Row label="Days" value={ext.leave.days != null ? String(ext.leave.days) : "—"} />
                {ext.leave.reason ? <Row label="Reason" value={ext.leave.reason} /> : null}
                <Row label="Summary" value={ext.rawSummary} />
              </dl>
            ) : (
              <p className="text-[12px] text-muted-foreground">No extraction available.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* HR manual approve/reject — disabled for now (re-enable with LEAVE_EMAIL_HR_REVIEW_ENABLED=true).

function ReviewPanel(...) { ... approve / reject UI ... }

*/

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground shrink-0 w-24">{label}</dt>
      <dd className="text-foreground min-w-0">{value}</dd>
    </div>
  );
}
