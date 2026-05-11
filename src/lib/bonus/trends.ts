function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AnnualTrendPoint = {
  year: number;
  totalBonus: number;
  avgPerformance: number; // 0-5
};

export type MonthlyTrendPoint = {
  month: string; // Jan..Dec
  value: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function buildAnnualTrend(opts?: { startYear?: number; endYear?: number; baseBonus?: number; seed?: number }): AnnualTrendPoint[] {
  const startYear = opts?.startYear ?? 2021;
  const endYear = opts?.endYear ?? 2030;
  const seed = opts?.seed ?? 42;
  const baseBonus = Math.max(0, opts?.baseBonus ?? 1_250_000);

  const rng = mulberry32(seed);
  const out: AnnualTrendPoint[] = [];

  let bonus = baseBonus;
  let perf = 3.35;
  for (let y = startYear; y <= endYear; y++) {
    const growth = 0.04 + (rng() - 0.5) * 0.06; // ~1%..7%
    const shock = (rng() - 0.5) * 0.12; // +/- 6% noise
    bonus = bonus * (1 + growth + shock);
    perf = clamp(perf + (rng() - 0.5) * 0.18, 2.6, 4.7);

    out.push({
      year: y,
      totalBonus: Math.round(bonus),
      avgPerformance: Math.round(perf * 100) / 100,
    });
  }
  return out;
}

export function buildMonthlyTrendForYear(
  year: number,
  annualBonus: number,
  seed?: number
): Array<{ month: string; bonus: number; performance: number }> {
  const rng = mulberry32((seed ?? 42) + year * 101);

  const seasonality = [0.82, 0.9, 0.95, 1.02, 1.05, 1.08, 1.0, 0.96, 0.94, 0.98, 1.06, 1.24];
  const totalWeight = seasonality.reduce((s, n) => s + n, 0);
  const valuePerWeight = annualBonus / totalWeight;

  let perf = 3.3 + (rng() - 0.5) * 0.2;

  return MONTHS.map((m, i) => {
    const noise = 1 + (rng() - 0.5) * 0.12;
    perf = clamp(perf + (rng() - 0.5) * 0.2, 2.6, 4.8);
    const bonus = Math.max(0, valuePerWeight * seasonality[i]! * noise);
    return {
      month: m,
      bonus: Math.round(bonus),
      performance: Math.round(perf * 100) / 100,
    };
  });
}

