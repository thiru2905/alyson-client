import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AlysonLogo } from "@/components/AlysonLogo";
import {
  LANDING_MODULES,
  ModuleSnapPreview,
  type LandingModule,
} from "@/components/landing/LandingModuleSnapshots";
import { MODULE_GUIDE } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

const TOUR_STEP_MS = 5000;

const HELP_ITEM: LandingModule = {
  group: "Ops",
  name: "Help",
  icon: HelpCircle,
  variant: "list",
};

const FRAME_NAV: LandingModule[] = [...LANDING_MODULES, HELP_ITEM];

const MODULE_INSIGHTS: Record<string, string> = {
  Dashboard: "Payroll up 8%. Headcount +3, meeting load +12%",
  "Time Dashboard": "Omer pacing 6.2h ahead · team avg on track for Friday",
  Payroll: "April cycle posted · net $104k after taxes",
  "Meeting Hours": "Top 3: Omer, Arman, Zaman · 18.4h this week",
  "Alyson Brain": "Ask anything. Answers cite live module tables",
  Leave: "4 requests pending approval · 2 starting next week",
  Workflows: "Leave approval waiting on manager sign-off",
  Help: "Search docs, shortcuts, and module guides",
};

const CHART_HEIGHTS = [35, 55, 42, 70, 48, 62, 58, 75, 50, 68, 44, 60];

const DASHBOARD_KPIS = [
  { l: "Headcount", v: "47" },
  { l: "Payroll/mo", v: "$1.42M" },
  { l: "Meeting hrs", v: "724h" },
  { l: "Pending", v: "3" },
] as const;

function moduleSummary(name: string) {
  return MODULE_GUIDE.find((m) => m.name === name)?.summary ?? "Explore this module in your workspace.";
}

function DashboardHero() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        {DASHBOARD_KPIS.map((k, i) => (
          <motion.div
            key={k.l}
            className="surface-card p-2.5 md:p-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
          >
            <div className="text-[8px] md:text-[9px] text-muted-foreground">{k.l}</div>
            <div className="font-display text-sm md:text-base font-semibold tabular-nums mt-1">{k.v}</div>
          </motion.div>
        ))}
      </div>
      <motion.div
        className="mt-3 surface-card p-2 md:p-3 flex items-end gap-1 flex-1 min-h-[9rem]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {CHART_HEIGHTS.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm bg-foreground/15 origin-bottom"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.25 + i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: `${h}%` }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function FrameInsightStrip({ text }: { text: string }) {
  return (
    <motion.div
      key={text}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/25 px-2 py-1.5 shrink-0"
    >
      <img src="/images/alyson-mini.svg" alt="" className="h-4 w-4 shrink-0 rounded-full" />
      <span className="text-[9px] md:text-[10px] text-muted-foreground truncate">{text}</span>
    </motion.div>
  );
}

function NavItemButton({
  item,
  active,
  onSelect,
  buttonRef,
}: {
  item: LandingModule;
  active: boolean;
  onSelect: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const Icon = item.icon;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[9px] md:text-[10px] transition-colors",
        active ? "text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40",
      )}
    >
      {active ? (
        <motion.span
          layoutId="landing-frame-active-nav"
          className="absolute inset-0 rounded-md bg-sidebar-accent"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <Icon className="relative h-3 w-3 shrink-0" />
      <span className="relative truncate leading-tight">{item.name}</span>
    </button>
  );
}

export function LandingAppFrame() {
  const [activeIndex, setActiveIndex] = useState(() =>
    FRAME_NAV.findIndex((m) => m.name === "Dashboard"),
  );
  const [paused, setPaused] = useState(false);
  const [tourProgress, setTourProgress] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const active = FRAME_NAV[activeIndex] ?? FRAME_NAV[0];
  const isDashboard = active.name === "Dashboard";
  const insight = MODULE_INSIGHTS[active.name] ?? moduleSummary(active.name);

  const grouped = useMemo(() => {
    const map = new Map<string, LandingModule[]>();
    for (const g of NAV_GROUPS) {
      map.set(g, FRAME_NAV.filter((m) => m.group === g));
    }
    return map;
  }, []);

  const selectModule = useCallback((index: number, pauseMs = 10_000) => {
    setActiveIndex(index);
    setPaused(true);
    setTourProgress(0);
    window.setTimeout(() => setPaused(false), pauseMs);
  }, []);

  useEffect(() => {
    const el = itemRefs.current.get(active.name);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active.name]);

  useEffect(() => {
    if (paused) return;
    const duration = TOUR_STEP_MS;
    const tick = 50;
    let elapsed = 0;
    const interval = window.setInterval(() => {
      elapsed += tick;
      setTourProgress(Math.min(1, elapsed / duration));
      if (elapsed >= duration) {
        elapsed = 0;
        setTourProgress(0);
        setActiveIndex((i) => (i + 1) % FRAME_NAV.length);
      }
    }, tick);
    return () => window.clearInterval(interval);
  }, [paused, activeIndex]);

  return (
    <div
      ref={frameRef}
      className="surface-lifted overflow-hidden rounded-xl shadow-[var(--shadow-lift)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex h-[min(640px,78vw)] min-h-[420px]">
        <aside className="hidden md:flex w-[min(200px,28%)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar min-h-0">
          <div className="border-b border-sidebar-border px-3 py-2.5 shrink-0">
            <AlysonLogo size={22} wordmarkClassName="text-[12px]" />
            <div className="text-[8px] text-muted-foreground mt-0.5">Acme, Inc.</div>
          </div>

          <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 space-y-2 landing-frame-nav-scroll">
            {NAV_GROUPS.map((group) => {
              const items = grouped.get(group) ?? [];
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div className="px-2 py-0.5 text-[7px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const index = FRAME_NAV.findIndex((m) => m.name === item.name);
                      return (
                        <NavItemButton
                          key={item.name}
                          item={item}
                          active={active.name === item.name}
                          onSelect={() => selectModule(index)}
                          buttonRef={(el) => {
                            if (el) itemRefs.current.set(item.name, el);
                            else itemRefs.current.delete(item.name);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="shrink-0 border-t border-sidebar-border p-2">
            <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
              <motion.div
                className="h-full bg-foreground/25"
                style={{ width: `${tourProgress * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[7px] text-muted-foreground text-center">
              {paused ? "Exploring" : "Auto tour"} · {FRAME_NAV.length} modules
            </p>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col bg-background min-h-0">
          <div className="h-9 border-b border-border flex items-center px-3 gap-2 shrink-0">
            <div className="hidden sm:flex h-5 flex-1 max-w-[180px] items-center gap-1.5 rounded border border-border bg-muted/30 px-2">
              <Search className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[9px] text-muted-foreground truncate">Search modules…</span>
            </div>
            <div className="sm:hidden h-5 flex-1 max-w-[100px] rounded border border-border bg-muted/40" />
            <div className="h-5 w-5 rounded-md bg-muted/40" />
            <div className="h-5 w-5 rounded-full bg-muted/50" />
          </div>

          <div className="flex-1 p-3 md:p-4 overflow-hidden flex flex-col min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.name}
                className="flex flex-col flex-1 min-h-0"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                  {active.group}
                </div>
                <div className="font-display text-lg md:text-xl font-semibold tracking-tight mt-0.5">
                  {active.name}
                </div>
                <p className="text-[10px] md:text-[11px] text-muted-foreground mt-1 line-clamp-2">
                  {moduleSummary(active.name)}
                </p>

                <div className="mt-3 flex-1 min-h-0 overflow-hidden">
                  {isDashboard ? (
                    <DashboardHero />
                  ) : (
                    <div className="h-full flex items-start justify-center overflow-auto">
                      <motion.div
                        className="w-full max-w-lg"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: 0.05 }}
                      >
                        <div className="surface-card rounded-lg overflow-hidden shadow-[var(--shadow-soft)] landing-frame-preview-scale">
                          <ModuleSnapPreview mod={active} />
                        </div>
                      </motion.div>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <FrameInsightStrip text={insight} />
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile module picker */}
      <div className="md:hidden border-t border-border bg-muted/15 px-2 py-2 flex gap-1 overflow-x-auto">
        {FRAME_NAV.map((item, index) => {
          const Icon = item.icon as LucideIcon;
          const on = active.name === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => selectModule(index)}
              className={cn(
                "shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[9px] border",
                on ? "bg-sidebar-accent text-sidebar-accent-foreground border-border" : "border-transparent text-muted-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              <span className="max-w-[72px] truncate">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
