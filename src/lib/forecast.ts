/**
 * Pure forecasting helpers used by the executive dashboard.
 * Deterministic — no randomness — so the same inputs always render the same
 * forecast curve in tests, screenshots, and side-by-side scenarios.
 */

export type Scenario = "base" | "growth" | "conservative";

export type ForecastPoint = {
  period: string; // YYYY-MM-01
  label: string; // "Apr"
  payroll: number;
  equityCost: number;
  bonus: number;
  cumulative: number;
};

const SCENARIO_FACTORS: Record<
  Scenario,
  { payrollGrowth: number; bonusFactor: number; equityFactor: number }
> = {
  base: { payrollGrowth: 0.012, bonusFactor: 1, equityFactor: 1 },
  growth: { payrollGrowth: 0.028, bonusFactor: 1.18, equityFactor: 1.25 },
  conservative: { payrollGrowth: 0.004, bonusFactor: 0.85, equityFactor: 0.9 },
};

export function buildForecast(
  startMonthlyPayroll: number,
  bonusPool: number,
  equityMonthlyCost: number,
  months: number,
  scenario: Scenario,
): ForecastPoint[] {
  const f = SCENARIO_FACTORS[scenario];
  const out: ForecastPoint[] = [];
  let cum = 0;
  let p = startMonthlyPayroll;
  const today = new Date();
  for (let i = 1; i <= months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    p = p * (1 + f.payrollGrowth);
    const bonus = (bonusPool / 12) * f.bonusFactor;
    const equity = equityMonthlyCost * f.equityFactor;
    const total = p + bonus + equity;
    cum += total;
    out.push({
      period: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en", { month: "short" }),
      payroll: Math.round(p),
      bonus: Math.round(bonus),
      equityCost: Math.round(equity),
      cumulative: Math.round(cum),
    });
  }
  return out;
}

export const SCENARIO_LABEL: Record<Scenario, string> = {
  base: "Base case",
  growth: "Growth case",
  conservative: "Conservative",
};
