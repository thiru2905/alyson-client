import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";

const ROUTES = [
  { to: "/", label: "Dashboard", group: "Workspace" },
  { to: "/team", label: "Team directory", group: "People" },
  { to: "/boarding", label: "Onboarding & offboarding", group: "People" },
  { to: "/performance", label: "Performance", group: "People" },
  { to: "/leave", label: "Leave", group: "People" },
  { to: "/attendance", label: "Attendance", group: "People" },
  { to: "/payroll", label: "Payroll", group: "Money" },
  { to: "/bonus", label: "Bonus", group: "Money" },
  { to: "/equity", label: "Equity & cap table", group: "Money" },
  { to: "/workflows", label: "Workflows inbox", group: "Ops" },
  { to: "/documents", label: "Documents", group: "Ops" },
  { to: "/reports", label: "Reports & KPIs", group: "Ops" },
  { to: "/admin", label: "Admin", group: "Admin" },
  { to: "/help", label: "Help & docs", group: "Admin" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const filtered = ROUTES.filter((r) =>
    !q || r.label.toLowerCase().includes(q.toLowerCase()) || r.group.toLowerCase().includes(q.toLowerCase()),
  );

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = filtered[active];
        if (r) {
          navigate({ to: r.to as "/" });
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, active, navigate, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-24 -translate-x-1/2 z-50 w-[90%] max-w-lg surface-lifted overflow-hidden">
        <div className="px-4 h-12 border-b border-border flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to…"
            className="flex-1 bg-transparent text-[14px] focus:outline-none"
          />
          <kbd className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-muted-foreground">No matches.</div>
          ) : (
            filtered.map((r, i) => (
              <button
                key={r.to}
                onClick={() => {
                  navigate({ to: r.to as "/" });
                  onClose();
                }}
                onMouseEnter={() => setActive(i)}
                className={
                  "w-full flex items-center justify-between px-3 py-2 rounded text-[13px] " +
                  (i === active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/40")
                }
              >
                <span className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider opacity-60 w-16 text-left">{r.group}</span>
                  <span>{r.label}</span>
                </span>
                <ArrowRight className="h-3 w-3 opacity-50" />
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
