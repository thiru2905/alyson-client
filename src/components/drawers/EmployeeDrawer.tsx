import { Drawer } from "@/components/Drawer";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency, fmtDate } from "@/lib/format";
import type { EmployeeFull } from "@/lib/queries";
import { Mail, Calendar as CalIcon, HardDrive, FileText } from "lucide-react";

type Tab = "overview" | "comp" | "payroll" | "leave" | "reviews" | "equity" | "audit";
const TABS: { k: Tab; label: string }[] = [
  { k: "overview", label: "Overview" },
  { k: "comp", label: "Compensation" },
  { k: "payroll", label: "Payroll" },
  { k: "leave", label: "Leave" },
  { k: "reviews", label: "Reviews" },
  { k: "equity", label: "Equity" },
  { k: "audit", label: "Audit" },
];

export function EmployeeDrawer({
  employee,
  onClose,
}: {
  employee: EmployeeFull | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <Drawer
      open={!!employee}
      onClose={onClose}
      title={employee?.full_name ?? ""}
      eyebrow={employee ? `${employee.role} · ${employee.department_name}` : undefined}
      width="xl"
    >
      {employee && (
        <div>
          <div className="px-5 pt-4 border-b border-border flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={
                  "px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap " +
                  (tab === t.k
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "overview" && <OverviewTab e={employee} />}
            {tab === "comp" && <CompTab e={employee} />}
            {tab === "payroll" && <PayrollTab id={employee.id} />}
            {tab === "leave" && <LeaveTab id={employee.id} />}
            {tab === "reviews" && <ReviewsTab id={employee.id} />}
            {tab === "equity" && <EquityTab id={employee.id} />}
            {tab === "audit" && <AuditTab id={employee.id} />}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function OverviewTab({ e }: { e: EmployeeFull }) {
  const [range, setRange] = useState<7 | 14 | 30>(7);

  const activity = useMemo(() => {
    // Deterministic demo metrics until Google Workspace ingestion is wired.
    const s = String(e.id ?? "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const scale = range / 7;
    const emailsSent = Math.round((10 + (h % 70)) * scale);
    const emailsReceived = Math.round((18 + ((h >>> 3) % 95)) * scale);
    const externalPct = 8 + ((h >>> 7) % 44); // %
    const avgReplyMins = 12 + ((h >>> 9) % 220); // minutes

    const meetingsCreated = Math.max(0, Math.round((1 + ((h >>> 6) % 10)) * scale * 0.45));
    const meetingsAttended = Math.max(meetingsCreated, Math.round((2 + ((h >>> 5) % 14)) * scale * 0.65));
    const meetingHours = Number(((meetingsAttended * (22 + ((h >>> 11) % 28))) / 60).toFixed(1)); // avg 22-50m

    const docsCreated = Math.max(0, Math.round((1 + ((h >>> 10) % 18)) * (range / 30)));
    const docEdits = Math.round((14 + ((h >>> 12) % 160)) * (range / 30));
    const comments = Math.round((2 + ((h >>> 13) % 60)) * (range / 30));

    const driveGb = 2 + ((h >>> 14) % 38);
    const filesCreated = Math.round((5 + ((h >>> 15) % 80)) * (range / 30));
    const sharesCreated = Math.round((1 + ((h >>> 16) % 24)) * (range / 30));
    const externalShares = Math.round(sharesCreated * (0.08 + (((h >>> 17) % 18) / 100)));

    const failedLogins = Math.round(((h >>> 18) % 6) * (range / 30));
    const riskyApps = (h >>> 20) % 4;

    // Additional “grading” signals (demo)
    const chatMessages = Math.round((30 + ((h >>> 21) % 420)) * (range / 30));
    const spacesCreated = Math.round(((h >>> 24) % 6) * (range / 30));
    const mentions = Math.round((6 + ((h >>> 25) % 80)) * (range / 30));

    const meetingsWithExternal = Math.round(meetingsAttended * (0.18 + (((h >>> 26) % 25) / 100)));
    const meetingNoShowPct = 2 + ((h >>> 27) % 18);
    const focusHours = Number(Math.max(0, (range * 8 - meetingHours)).toFixed(1));

    const filesViewed = Math.round((40 + ((h >>> 28) % 600)) * (range / 30));
    const publicLinks = Math.round(((h >>> 29) % 6) * (range / 30));
    const storageGrowthGb = Number((((h >>> 30) % 9) * (range / 30)).toFixed(1));

    const twoStepEnabled = ((h >>> 19) % 10) > 1; // mostly true
    const passwordResets = Math.round(((h >>> 22) % 3) * (range / 30));
    const newDeviceLogins = Math.round(((h >>> 23) % 5) * (range / 30));
    const deviceCompliancePct = 72 + ((h >>> 8) % 28);
    const dlpViolations = Math.round(((h >>> 17) % 4) * (range / 30));

    return {
      emailsSent,
      emailsReceived,
      externalPct,
      avgReplyMins,
      meetingsCreated,
      meetingsAttended,
      meetingHours,
      docsCreated,
      docEdits,
      comments,
      driveGb,
      filesCreated,
      sharesCreated,
      externalShares,
      failedLogins,
      riskyApps,
      chatMessages,
      spacesCreated,
      mentions,
      meetingsWithExternal,
      meetingNoShowPct,
      focusHours,
      filesViewed,
      publicLinks,
      storageGrowthGb,
      twoStepEnabled,
      passwordResets,
      newDeviceLogins,
      deviceCompliancePct,
      dlpViolations,
    };
  }, [e.id, range]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Expose live on-screen context for Alyson Mini (source-of-truth for this module view).
    (window as any).__ALYSON_MINI_CONTEXT__ = {
      module: "team",
      view: "employee_overview",
      range_days: range,
      employee: {
        id: e.id,
        name: e.full_name,
        email: e.email,
        role: e.role,
        department: e.department_name,
      },
      workspace_activity: activity,
      notes: "Workspace activity values are demo placeholders until Google Workspace ingestion is enabled.",
    };
  }, [e.id, e.full_name, e.email, e.role, e.department_name, range, activity]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Level" value={e.level} />
        <Stat label="Performance" value={`${Number(e.performance_score).toFixed(1)} / 5`} />
        <Stat label="Hire date" value={fmtDate(e.hire_date)} />
        <Stat label="Total comp" value={fmtCurrency(e.total_comp, { compact: true })} />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Email</div>
        <div className="text-[13px] font-mono">{e.email}</div>
      </div>

      <div className="surface-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace activity</div>
            <div className="text-[13px] text-muted-foreground mt-1">
              Demo metrics for now — will be replaced by Google Workspace Admin data.
            </div>
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5 bg-paper">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRange(d)}
                className={
                  "h-7 px-2.5 rounded text-[11.5px] font-medium transition-colors " +
                  (range === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                }
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Communication</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label={`Emails sent (${range}d)`} value={String(activity.emailsSent)} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label={`Emails received (${range}d)`} value={String(activity.emailsReceived)} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label="External email %" value={`${activity.externalPct}%`} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label="Avg reply time" value={`${activity.avgReplyMins}m`} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label={`Chat msgs (${range}d)`} value={String(activity.chatMessages)} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label={`Spaces created (${range}d)`} value={String(activity.spacesCreated)} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label={`Mentions (${range}d)`} value={String(activity.mentions)} />
          <MiniMetric icon={<Mail className="h-3.5 w-3.5" />} label="2‑step verification" value={activity.twoStepEnabled ? "On" : "Off"} />
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Meetings & time</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label={`Meetings created (${range}d)`} value={String(activity.meetingsCreated)} />
          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label={`Meetings attended (${range}d)`} value={String(activity.meetingsAttended)} />
          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label={`Meeting hours (${range}d)`} value={String(activity.meetingHours)} />
          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label={`External meetings (${range}d)`} value={String(activity.meetingsWithExternal)} />
          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label="No‑show rate" value={`${activity.meetingNoShowPct}%`} />
          <MiniMetric icon={<CalIcon className="h-3.5 w-3.5" />} label={`Focus hours (${range}d)`} value={String(activity.focusHours)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label="Drive used" value={`${activity.driveGb}GB`} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Storage growth (${range}d)`} value={`${activity.storageGrowthGb}GB`} />
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Content & sharing</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <MiniMetric icon={<FileText className="h-3.5 w-3.5" />} label={`Docs created (${range}d)`} value={String(activity.docsCreated)} />
          <MiniMetric icon={<FileText className="h-3.5 w-3.5" />} label={`Doc edits (${range}d)`} value={String(activity.docEdits)} />
          <MiniMetric icon={<FileText className="h-3.5 w-3.5" />} label={`Comments (${range}d)`} value={String(activity.comments)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Files created (${range}d)`} value={String(activity.filesCreated)} />

          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Shares created (${range}d)`} value={String(activity.sharesCreated)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`External shares (${range}d)`} value={String(activity.externalShares)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Files viewed (${range}d)`} value={String(activity.filesViewed)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Public links (${range}d)`} value={String(activity.publicLinks)} />
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Security & devices</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Failed logins (${range}d)`} value={String(activity.failedLogins)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label="Risky apps" value={String(activity.riskyApps)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`Password resets (${range}d)`} value={String(activity.passwordResets)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`New devices (${range}d)`} value={String(activity.newDeviceLogins)} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label="Device compliance" value={`${activity.deviceCompliancePct}%`} />
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label={`DLP violations (${range}d)`} value={String(activity.dlpViolations)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="mt-2 font-display text-xl leading-none">{value}</div>
    </div>
  );
}

function CompTab({ e }: { e: EmployeeFull }) {
  if (!e.comp) return <Empty msg="No compensation record on file." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Base salary" value={fmtCurrency(Number(e.comp.base_salary))} />
        <Stat label="Bonus %" value={`${Number(e.comp.bonus_pct).toFixed(1)}%`} />
        <Stat label="Equity grant" value={fmtCurrency(Number(e.comp.equity_grant))} />
        <Stat label="Benefits" value={fmtCurrency(Number(e.comp.benefits))} />
      </div>
      <div className="surface-card p-4 bg-muted/30">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Effective bonus (perf-weighted)</div>
        <div className="font-display text-2xl mt-1">{fmtCurrency(e.effective_bonus)}</div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Effective from {fmtDate(e.comp.effective_date)}
      </div>
    </div>
  );
}

function PayrollTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["emp-payroll", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_items")
        .select("*, payroll_runs(period, status)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data?.length) return <Empty msg="No payroll items yet." />;
  return (
    <div className="space-y-2">
      {data.map((p: any) => (
        <div key={p.id} className="flex justify-between py-2 border-b border-border text-[13px]">
          <div>
            <div className="font-medium capitalize">{p.item_type.replace(/_/g, " ")}</div>
            <div className="text-[11px] text-muted-foreground">
              {p.payroll_runs?.period ? new Date(p.payroll_runs.period).toLocaleDateString("en", { month: "short", year: "numeric" }) : "—"}
            </div>
          </div>
          <div className="font-mono">{fmtCurrency(Number(p.amount))}</div>
        </div>
      ))}
    </div>
  );
}

function LeaveTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["emp-leave", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_balances")
        .select("*, leave_types(name, color, code)")
        .eq("employee_id", id);
      return data ?? [];
    },
  });
  if (!data?.length) return <Empty msg="No leave balances on file." />;
  return (
    <div className="space-y-2">
      {data.map((b: any) => (
        <div key={b.id} className="surface-card p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: b.leave_types?.color }} />
            <div>
              <div className="font-medium text-[13px]">{b.leave_types?.name}</div>
              <div className="text-[11px] text-muted-foreground">{b.year}</div>
            </div>
          </div>
          <div className="text-right font-mono text-[13px]">
            {Number(b.remaining).toFixed(1)} <span className="text-muted-foreground">/ {Number(b.entitled).toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewsTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["emp-reviews", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("*, review_cycles(name, status)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  if (!data?.length) return <Empty msg="No reviews yet." />;
  return (
    <div className="space-y-2">
      {data.map((r: any) => (
        <div key={r.id} className="surface-card p-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-medium text-[13px]">{r.review_cycles?.name ?? "Cycle"}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{r.status}</div>
            </div>
            <span className={`pill ${Number(r.rating) >= 4 ? "pill-success" : Number(r.rating) >= 3 ? "pill-info" : "pill-warning"}`}>{Number(r.rating).toFixed(1)}</span>
          </div>
          {r.comments && <div className="mt-2 text-[12px] text-muted-foreground italic">"{r.comments}"</div>}
        </div>
      ))}
    </div>
  );
}

function EquityTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["emp-equity", id],
    queryFn: async () => {
      const { data: holders } = await supabase
        .from("equity_holders")
        .select("id, equity_grants(*)")
        .eq("employee_id", id);
      return (holders ?? []).flatMap((h: any) => h.equity_grants ?? []);
    },
  });
  if (!data?.length) return <Empty msg="No equity grants for this employee." />;
  return (
    <div className="space-y-2">
      {data.map((g: any) => (
        <div key={g.id} className="surface-card p-3 flex justify-between text-[13px]">
          <div>
            <div className="font-medium capitalize">{g.security_type.replace(/_/g, " ")}</div>
            <div className="text-[11px] text-muted-foreground">
              {fmtDate(g.grant_date)} · {g.cliff_months}m cliff · {g.vesting_years}y vest
            </div>
          </div>
          <div className="text-right font-mono">{Number(g.total_shares).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["emp-audit", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });
  if (!data?.length) return <Empty msg="No audit entries." />;
  return (
    <div className="space-y-1.5">
      {data.map((a: any) => (
        <div key={a.id} className="text-[12px] py-1.5 border-b border-border">
          <span className="font-mono">{a.action}</span>
          <span className="text-muted-foreground ml-2">{fmtDate(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-[14px] mt-0.5">{value}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-[13px] text-muted-foreground py-6 text-center">{msg}</div>;
}
