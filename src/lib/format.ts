export const fmtCurrency = (v: number, opts?: { compact?: boolean; currency?: string }) => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: opts?.currency ?? "USD",
    maximumFractionDigits: 0,
    notation: opts?.compact ? "compact" : "standard",
  });
  return formatter.format(Number.isFinite(v) ? v : 0);
};

export const fmtNumber = (v: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v ?? 0);

export const fmtPct = (v: number, digits = 1) => `${(v ?? 0).toFixed(digits)}%`;

export const fmtMonth = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmtRelative = (iso: string) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const abs = Math.abs(diff);
  const fwd = diff < 0 ? "in " : "";
  const back = diff >= 0 ? " ago" : "";
  if (abs < 60) return "just now";
  if (abs < 3600) return `${fwd}${Math.round(abs / 60)}m${back}`;
  if (abs < 86400) return `${fwd}${Math.round(abs / 3600)}h${back}`;
  if (abs < 604800) return `${fwd}${Math.round(abs / 86400)}d${back}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
