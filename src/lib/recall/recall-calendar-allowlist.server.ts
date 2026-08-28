const DEFAULT_ALLOWED = [
  "alysonclient@cintara.ai",
  "mohita@cintara.ai",
  "arman@cintara.ai",
  "aditya@cintara.ai",
  "notetaker@cintara.ai",
  "thirumalai@cintara.ai",
  "vinit@cintara.ai",
];

function normalizeEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/**
 * Calendars for these accounts get Recall auto-scheduling (webhooks + cron Sync).
 * Primary operators: alysonclient, mohita, arman, aditya.
 * Bots still use timed 48h retention (cost save) via Recall-direct create.
 */
export function getRecallCalendarAllowlist(): string[] {
  const defaults = DEFAULT_ALLOWED.map(normalizeEmail);
  const raw = process.env.RECALL_CALENDAR_AUTO_SCHEDULE_EMAILS?.trim();
  if (!raw) return defaults;
  const fromEnv = raw
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
  // Env extends (not replaces) defaults so new in-code emails work without a Vercel env edit.
  return [...new Set([...defaults, ...fromEnv])];
}

export function isRecallCalendarEmailAllowed(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email || "");
  if (!normalized) return false;
  return getRecallCalendarAllowlist().includes(normalized);
}

export function assertRecallCalendarEmailAllowed(email: string | null | undefined): void {
  if (isRecallCalendarEmailAllowed(email)) return;
  throw new Error(
    `Auto-schedule is only enabled for: ${getRecallCalendarAllowlist().join(", ")} (got ${email || "unknown"})`,
  );
}

export function recallCalendarAllowlistLabel(): string {
  return getRecallCalendarAllowlist().join(", ");
}
