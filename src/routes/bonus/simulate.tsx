import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { fmtCurrency } from "@/lib/format";
import { allocateBonus, normalizeInputs } from "@/lib/bonus/engine";
import { DEFAULT_BONUS_INPUTS, MOCK_EMPLOYEES } from "@/lib/bonus/mock";
import type { BonusInputs } from "@/lib/bonus/types";

export const Route = createFileRoute("/bonus/simulate")({
  component: BonusSimulatePage,
});

function BonusSimulatePage() {
  const { hasRole } = useAuth();
  const canEditAll = hasRole("super_admin");
  const canEditControls = canEditAll || hasRole("ceo");

  const [inputs, setInputs] = useState<BonusInputs>(DEFAULT_BONUS_INPUTS);
  const normalized = useMemo(() => normalizeInputs(inputs), [inputs]);
  const allocation = useMemo(() => allocateBonus(MOCK_EMPLOYEES, normalized), [normalized]);

  return (
    <div className="px-5 md:px-8 py-6 space-y-6">
      <div className="surface-card p-4">
        <div className="font-display text-lg">Simulation</div>
        <div className="text-[12px] text-muted-foreground mt-1">
          Adjust GP and pool parameters to see live variance in bonus allocations. Mock data (demo).
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-card p-4 space-y-4">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Controls</div>

          <Row label="Gross Profit (GP)" right={fmtCurrency(normalized.grossProfit, { compact: true })}>
            <input
              type="number"
              min={0}
              value={normalized.grossProfit}
              disabled={!canEditControls}
              onChange={(e) => setInputs((p) => ({ ...p, grossProfit: Number(e.target.value) }))}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
            />
          </Row>

          <Row label="Bonus Pool %" right={`${normalized.bonusPoolPct.toFixed(0)}%`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={normalized.bonusPoolPct}
                disabled={!canEditControls}
                onChange={(e) => setInputs((p) => ({ ...p, bonusPoolPct: Number(e.target.value) }))}
                className="w-full"
              />
              <input
                type="number"
                min={0}
                max={25}
                value={normalized.bonusPoolPct}
                disabled={!canEditControls}
                onChange={(e) => setInputs((p) => ({ ...p, bonusPoolPct: Number(e.target.value) }))}
                className="w-20 h-9 px-2 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
              />
            </div>
          </Row>

          <Row label="Top Performers share" right={`${normalized.splitTopPct.toFixed(0)}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={normalized.splitTopPct}
              disabled={!canEditControls}
              onChange={(e) => setInputs((p) => ({ ...p, splitTopPct: Number(e.target.value) }))}
              className="w-full"
            />
          </Row>

          <div className="pt-3 border-t border-border">
            <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Point weights</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Mini label="Mgmt" value={normalized.points.topMgmt} disabled={!canEditAll} onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, topMgmt: v } }))} />
              <Mini label="EPD" value={normalized.points.topEpd} disabled={!canEditAll} onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, topEpd: v } }))} />
              <Mini label="Good" value={normalized.points.good} disabled={!canEditAll} onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, good: v } }))} />
            </div>
            {!canEditAll && <div className="mt-2 text-[12px] text-muted-foreground">Point weights are editable by Super Admin only.</div>}
          </div>
        </div>

        <div className="surface-card p-4">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Output</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi label="Total pool" value={fmtCurrency(allocation.totalPool, { compact: true })} />
            <Kpi label="Top pool" value={fmtCurrency(allocation.poolTop, { compact: true })} />
            <Kpi label="Good pool" value={fmtCurrency(allocation.poolGood, { compact: true })} />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi label="Mgmt total" value={fmtCurrency(allocation.totals.mgmt, { compact: true })} />
            <Kpi label="EPD total" value={fmtCurrency(allocation.totals.epd, { compact: true })} />
            <Kpi label="Good total" value={fmtCurrency(allocation.totals.good, { compact: true })} />
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-[12px] font-medium">Explanation</div>
            <div className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              Total Bonus Pool = GP × Pool%. Top/Good split is applied, then Top Performers are distributed by points (Mgmt/EPD),
              Good Standing is distributed evenly per eligible head, and PIP/Notice are always $0.
            </div>
          </div>
        </div>
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[820px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Employee</th>
                <th align="left">Category</th>
                <th align="right">Points</th>
                <th align="right">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {allocation.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="font-medium">{r.employeeName}</td>
                  <td className="text-muted-foreground">{r.category}</td>
                  <td align="right" className="font-mono text-[12px]">{r.points.toFixed(0)}</td>
                  <td align="right" className="font-mono">{fmtCurrency(r.bonus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ label, right, children }: { label: string; right: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium">{label}</div>
        <div className="text-[12px] text-muted-foreground font-mono">{right}</div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Mini({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <input
        type="number"
        min={0}
        max={10}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg mt-1">{value}</div>
    </div>
  );
}

