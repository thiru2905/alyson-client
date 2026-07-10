import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  Calendar,
  CalendarDays,
  Captions,
  Clock,
  DollarSign,
  FileText,
  Gift,
  GitBranch,
  LayoutDashboard,
  Link2,
  List,
  ListTodo,
  PieChart,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";

export type SnapVariant = "kpis" | "table" | "bars" | "chat" | "calendar" | "list" | "rows" | "grid";

export type LandingModule = {
  name: string;
  group: "Workspace" | "People" | "Money" | "Ops";
  icon: LucideIcon;
  variant: SnapVariant;
};

export const LANDING_MODULES: LandingModule[] = [
  { group: "Workspace", name: "Alyson Brain", icon: Sparkles, variant: "chat" },
  { group: "Workspace", name: "Dashboard", icon: LayoutDashboard, variant: "kpis" },
  { group: "People", name: "Team", icon: Users, variant: "grid" },
  { group: "People", name: "Employee Onboarding", icon: UserPlus, variant: "list" },
  { group: "People", name: "Time Dashboard", icon: Clock, variant: "bars" },
  { group: "People", name: "Performance", icon: TrendingUp, variant: "bars" },
  { group: "People", name: "Leave", icon: Calendar, variant: "calendar" },
  { group: "People", name: "Attendance", icon: Clock, variant: "table" },
  { group: "Money", name: "Payroll", icon: DollarSign, variant: "table" },
  { group: "Money", name: "Bonus", icon: Gift, variant: "kpis" },
  { group: "Money", name: "Equity", icon: PieChart, variant: "bars" },
  { group: "Ops", name: "Workflows", icon: GitBranch, variant: "list" },
  { group: "Ops", name: "Documents", icon: FileText, variant: "rows" },
  { group: "Ops", name: "Handover Docs", icon: Link2, variant: "list" },
  { group: "Ops", name: "Workspace Activity", icon: Activity, variant: "bars" },
  { group: "Ops", name: "Employee Scoring", icon: Trophy, variant: "table" },
  { group: "Ops", name: "Reports", icon: BarChart3, variant: "bars" },
  { group: "Ops", name: "Alyson Notetaker", icon: Captions, variant: "chat" },
  { group: "Ops", name: "Meeting Hours", icon: Clock, variant: "table" },
  { group: "Ops", name: "Meeting List", icon: List, variant: "rows" },
  { group: "Ops", name: "Meeting Calendar", icon: CalendarDays, variant: "calendar" },
  { group: "Ops", name: "Analytics", icon: BarChart3, variant: "bars" },
  { group: "Ops", name: "Bot Join Report", icon: Bot, variant: "table" },
  { group: "Ops", name: "Unified Meetings", icon: CalendarDays, variant: "grid" },
  { group: "Ops", name: "Tasks", icon: ListTodo, variant: "list" },
];

function SnapShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative bg-background min-h-[88px] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/25 px-1.5 py-1.5 text-center">
      <div className="text-[7px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
      <div className="font-display text-[11px] font-semibold tabular-nums mt-0.5 leading-none">{value}</div>
    </div>
  );
}

function TableSnap({
  headers,
  rows,
}: {
  headers: [string, string];
  rows: Array<{ left: string; right: string; accent?: boolean }>;
}) {
  return (
    <div className="p-2">
      <div className="flex justify-between border-b border-border/80 pb-1 mb-1 text-[7px] uppercase tracking-wide text-muted-foreground font-medium">
        <span>{headers[0]}</span>
        <span>{headers[1]}</span>
      </div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div
            key={row.left}
            className={[
              "flex justify-between rounded px-1.5 py-0.5 text-[9px] tabular-nums",
              row.accent ? "bg-muted/40" : "",
            ].join(" ")}
          >
            <span className="truncate text-muted-foreground">{row.left}</span>
            <span className="font-medium shrink-0 ml-1">{row.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarsSnap({ heights, highlight }: { heights: number[]; highlight?: number }) {
  return (
    <div className="px-2.5 pt-2 pb-2 h-[88px] flex flex-col justify-end">
      <div className="flex items-end gap-0.5 h-[58px] border-b border-border/60 pb-px">
        {heights.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full">
            <div
              className={[
                "w-full rounded-t-[2px]",
                i === highlight ? "bg-foreground/30" : "bg-foreground/12",
              ].join(" ")}
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[7px] text-muted-foreground tabular-nums">
        <span>Mon</span>
        <span>Fri</span>
      </div>
    </div>
  );
}

function ChatSnap({ prompt, reply }: { prompt: string; reply: string }) {
  return (
    <div className="p-2 space-y-1.5">
      <div className="rounded-md border border-border bg-muted/35 px-2 py-1 text-[8px] text-muted-foreground leading-snug">
        {prompt}
      </div>
      <div className="flex gap-1.5 items-start">
        <img src="/images/alyson-mini.svg" alt="" className="h-3.5 w-3.5 shrink-0 rounded-full mt-0.5" />
        <div className="rounded-md border border-border bg-paper px-2 py-1 text-[8px] leading-snug flex-1 min-w-0">
          {reply}
        </div>
      </div>
    </div>
  );
}

function CalendarSnap({ marks }: { marks: number[] }) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {days.map((d, i) => (
          <div key={`${d}-${i}`} className="text-center text-[6px] text-muted-foreground font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {marks.map((mark, i) => (
          <div
            key={i}
            className={[
              "aspect-square rounded-[2px] relative",
              mark === 2 ? "bg-foreground/25 ring-1 ring-foreground/20" : mark === 1 ? "bg-foreground/12" : "bg-muted/40",
            ].join(" ")}
          >
            {mark > 0 ? (
              <span className="absolute bottom-[1px] right-[1px] h-0.5 w-0.5 rounded-full bg-amber-500" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSnap({ items }: { items: Array<{ label: string; status: "pending" | "progress" | "done" }> }) {
  const dot = {
    pending: "bg-amber-500",
    progress: "bg-foreground/45",
    done: "bg-emerald-500",
  } as const;
  return (
    <div className="p-2 space-y-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 rounded border border-border/60 bg-muted/20 px-1.5 py-1">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[item.status]}`} />
          <span className="text-[8px] text-muted-foreground truncate">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function RowsSnap({ rows }: { rows: Array<{ title: string; meta: string; tone?: "warm" | "cool" | "neutral" }> }) {
  const border = {
    warm: "border-l-amber-500/70",
    cool: "border-l-foreground/30",
    neutral: "border-l-border",
  } as const;
  return (
    <div className="p-2 space-y-1">
      {rows.map((row) => (
        <div
          key={row.title}
          className={[
            "rounded border border-border/70 border-l-2 bg-background px-1.5 py-1",
            border[row.tone ?? "neutral"],
          ].join(" ")}
        >
          <div className="text-[8px] font-medium truncate">{row.title}</div>
          <div className="text-[7px] text-muted-foreground tabular-nums">{row.meta}</div>
        </div>
      ))}
    </div>
  );
}

function GridSnap({ cells }: { cells: Array<{ label: string; sub?: string }> }) {
  return (
    <div className="grid grid-cols-3 gap-1 p-2">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rounded-md border border-border/80 bg-muted/25 aspect-[4/3] flex flex-col items-center justify-center px-0.5"
        >
          <div className="h-4 w-4 rounded-full bg-foreground/10 text-[7px] font-medium grid place-items-center shrink-0">
            {cell.label.slice(0, 2).toUpperCase()}
          </div>
          {cell.sub ? (
            <div className="text-[6px] text-muted-foreground mt-0.5 truncate max-w-full px-0.5">{cell.sub}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ModuleSnapPreview({ mod }: { mod: LandingModule }) {
  switch (mod.name) {
    case "Dashboard":
      return (
        <SnapShell>
          <div className="grid grid-cols-3 gap-1.5 p-2">
            <KpiTile label="Headcount" value="47" />
            <KpiTile label="Active" value="41" />
            <KpiTile label="PTO" value="6" />
          </div>
        </SnapShell>
      );
    case "Bonus":
      return (
        <SnapShell>
          <div className="grid grid-cols-3 gap-1.5 p-2">
            <KpiTile label="Pool" value="$24k" />
            <KpiTile label="Eligible" value="12" />
            <KpiTile label="Cycle" value="Q2" />
          </div>
        </SnapShell>
      );
    case "Alyson Brain":
      return (
        <SnapShell>
          <ChatSnap
            prompt="Why did payroll move this month?"
            reply="Headcount +3, bonus accrual +$18k. See Payroll board."
          />
        </SnapShell>
      );
    case "Alyson Notetaker":
      return (
        <SnapShell>
          <ChatSnap prompt="Standup · 10:02" reply="Action: ship pacing fix · owner Omer · due Fri." />
        </SnapShell>
      );
    case "Time Dashboard":
      return (
        <SnapShell>
          <BarsSnap heights={[42, 68, 55, 82, 61, 74, 58]} highlight={3} />
        </SnapShell>
      );
    case "Performance":
      return (
        <SnapShell>
          <BarsSnap heights={[58, 72, 48, 65, 80, 52]} highlight={4} />
        </SnapShell>
      );
    case "Equity":
      return (
        <SnapShell>
          <BarsSnap heights={[35, 48, 62, 55, 70, 44]} highlight={4} />
        </SnapShell>
      );
    case "Workspace Activity":
      return (
        <SnapShell>
          <BarsSnap heights={[50, 38, 66, 72, 45, 58]} highlight={3} />
        </SnapShell>
      );
    case "Reports":
    case "Analytics":
      return (
        <SnapShell>
          <BarsSnap heights={[44, 58, 52, 78, 63, 71, 49]} highlight={3} />
        </SnapShell>
      );
    case "Attendance":
      return (
        <SnapShell>
          <TableSnap
            headers={["Employee", "Today"]}
            rows={[
              { left: "Omer", right: "7.8h", accent: true },
              { left: "Arman", right: "6.1h" },
              { left: "Mohita", right: "5.4h" },
            ]}
          />
        </SnapShell>
      );
    case "Payroll":
      return (
        <SnapShell>
          <TableSnap
            headers={["Run", "Amount"]}
            rows={[
              { left: "Apr cycle", right: "$142k", accent: true },
              { left: "Taxes", right: "$38k" },
              { left: "Net", right: "$104k" },
            ]}
          />
        </SnapShell>
      );
    case "Meeting Hours":
      return (
        <SnapShell>
          <TableSnap
            headers={["Person", "Hours"]}
            rows={[
              { left: "Omer", right: "6.2h", accent: true },
              { left: "Arman", right: "4.1h" },
              { left: "Zaman", right: "3.8h" },
            ]}
          />
        </SnapShell>
      );
    case "Employee Scoring":
      return (
        <SnapShell>
          <TableSnap
            headers={["Name", "Score"]}
            rows={[
              { left: "Priya", right: "4.6", accent: true },
              { left: "Marcus", right: "4.2" },
              { left: "Elena", right: "3.9" },
            ]}
          />
        </SnapShell>
      );
    case "Bot Join Report":
      return (
        <SnapShell>
          <TableSnap
            headers={["Meeting", "Bot"]}
            rows={[
              { left: "Standup", right: "Joined", accent: true },
              { left: "Client sync", right: "Joined" },
              { left: "1:1", right: "Skipped" },
            ]}
          />
        </SnapShell>
      );
    case "Leave":
      return (
        <SnapShell>
          <CalendarSnap marks={[0, 1, 0, 2, 1, 0, 0, 0, 1, 0, 2, 0, 1, 0]} />
        </SnapShell>
      );
    case "Meeting Calendar":
      return (
        <SnapShell>
          <CalendarSnap marks={[1, 2, 1, 0, 2, 0, 1, 1, 0, 2, 1, 0, 0, 1]} />
        </SnapShell>
      );
    case "Employee Onboarding":
      return (
        <SnapShell>
          <ListSnap
            items={[
              { label: "Offer letter", status: "done" },
              { label: "IT provisioning", status: "progress" },
              { label: "Day-one checklist", status: "pending" },
            ]}
          />
        </SnapShell>
      );
    case "Workflows":
      return (
        <SnapShell>
          <ListSnap
            items={[
              { label: "Leave approval", status: "pending" },
              { label: "Expense review", status: "progress" },
              { label: "Headcount req.", status: "done" },
            ]}
          />
        </SnapShell>
      );
    case "Handover Docs":
      return (
        <SnapShell>
          <ListSnap
            items={[
              { label: "Access transfer", status: "progress" },
              { label: "Runbook links", status: "done" },
              { label: "Stakeholder list", status: "done" },
            ]}
          />
        </SnapShell>
      );
    case "Tasks":
      return (
        <SnapShell>
          <ListSnap
            items={[
              { label: "Review Q2 goals", status: "pending" },
              { label: "Send offer", status: "progress" },
              { label: "Close payroll", status: "done" },
            ]}
          />
        </SnapShell>
      );
    case "Help":
      return (
        <SnapShell>
          <ListSnap
            items={[
              { label: "Keyboard shortcuts", status: "done" },
              { label: "Module guides", status: "progress" },
              { label: "Contact support", status: "pending" },
            ]}
          />
        </SnapShell>
      );
    case "Documents":
      return (
        <SnapShell>
          <RowsSnap
            rows={[
              { title: "Offer template", meta: "Updated 2d ago", tone: "cool" },
              { title: "Handbook v3", meta: "Signed · 41", tone: "warm" },
              { title: "NDA pack", meta: "3 pending", tone: "neutral" },
            ]}
          />
        </SnapShell>
      );
    case "Meeting List":
      return (
        <SnapShell>
          <RowsSnap
            rows={[
              { title: "Standup", meta: "10:00 · 25m", tone: "warm" },
              { title: "Client sync", meta: "14:30 · 45m", tone: "cool" },
              { title: "1:1 review", meta: "16:00 · 30m", tone: "neutral" },
            ]}
          />
        </SnapShell>
      );
    case "Team":
      return (
        <SnapShell>
          <GridSnap
            cells={[
              { label: "Omer", sub: "Eng" },
              { label: "Priya", sub: "Ops" },
              { label: "Marcus", sub: "FP&A" },
              { label: "Elena", sub: "HR" },
              { label: "Arman", sub: "Eng" },
              { label: "Anita", sub: "Fin" },
            ]}
          />
        </SnapShell>
      );
    case "Unified Meetings":
      return (
        <SnapShell>
          <GridSnap
            cells={[
              { label: "AM", sub: "3 calls" },
              { label: "PM", sub: "5 calls" },
              { label: "WK", sub: "18h" },
              { label: "Bot", sub: "92%" },
              { label: "Rec", sub: "On" },
              { label: "Sync", sub: "Cal" },
            ]}
          />
        </SnapShell>
      );
    default:
      return (
        <SnapShell>
          <div className="p-2 text-[8px] text-muted-foreground">Preview</div>
        </SnapShell>
      );
  }
}

const GROUP_ACCENT: Record<LandingModule["group"], string> = {
  Workspace: "from-foreground/8 to-transparent",
  People: "from-foreground/6 to-transparent",
  Money: "from-foreground/7 to-transparent",
  Ops: "from-foreground/5 to-transparent",
};

function ModuleSnapCard({ mod, index }: { mod: LandingModule; index: number }) {
  const Icon = mod.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ delay: (index % 5) * 0.04, duration: 0.35 }}
      className="group surface-card overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5"
    >
      <div
        className={[
          "relative flex items-center gap-2 border-b border-border px-2.5 py-2 bg-gradient-to-r",
          GROUP_ACCENT[mod.group],
        ].join(" ")}
      >
        <div className="h-6 w-6 rounded-md border border-border/80 bg-paper grid place-items-center text-foreground shrink-0 shadow-[var(--shadow-soft)]">
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[11px] font-medium truncate leading-tight">{mod.name}</span>
      </div>
      <ModuleSnapPreview mod={mod} />
    </motion.div>
  );
}

export function LandingModuleSnapshots() {
  const groups = ["Workspace", "People", "Money", "Ops"] as const;

  return (
    <section id="modules" className="border-t border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-12 md:py-16">
        <div className="mb-8 md:mb-10">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Product
          </div>
          <h2 className="font-display text-2xl md:text-[34px] font-semibold tracking-tight mt-1.5">
            Every module in Alyson
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground max-w-xl">
            Mini previews of the real screens, using the same layout language as inside the app.
          </p>
        </div>

        <div className="space-y-10">
          {groups.map((group) => {
            const items = LANDING_MODULES.filter((m) => m.group === group);
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
                    {group}
                  </div>
                  <div className="h-px flex-1 bg-border" aria-hidden />
                  <div className="text-[10px] text-muted-foreground tabular-nums">{items.length}</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {items.map((mod, i) => (
                    <ModuleSnapCard key={mod.name} mod={mod} index={i} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
