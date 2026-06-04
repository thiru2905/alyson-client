/** Shared datetime helpers for workspace activity list + detail routes. */

export function isoForInput(d: Date) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function defaultWorkspaceRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 23 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function fmtWorkspaceWhen(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function fmtWorkspaceRangeLabel(startIso: string, endIso: string) {
  return `${fmtWorkspaceWhen(startIso)} → ${fmtWorkspaceWhen(endIso)} (IST)`;
}

export function parseDatetimeLocal(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
