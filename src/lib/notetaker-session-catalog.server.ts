import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";
import { drivePersistForBotIds } from "@/lib/notetaker-session-persist-drive.server";
import { ENDED_SESSION_STATUSES } from "@/lib/notetaker-session-status.server";
import { listAllUnifiedScheduledBotSessions } from "@/lib/unifiedMeetingsService";

export { ENDED_SESSION_STATUSES };

let lastCatalogMaintenanceAt = 0;

function catalogMaintenanceMinMs() {
  // Default 2 min — UI refetch is 30s; avoid overlapping Persist sweeps.
  const n = Number(process.env.NOTETAKER_CATALOG_MAINTENANCE_MIN_MS || 120_000);
  return Number.isFinite(n) && n >= 10_000 ? Math.min(n, 300_000) : 120_000;
}

/** Persist every discoverable bot transcript to S3 (upstream status + idle heuristics). */
export async function autoPersistDiscoverableSessions(sessions: NotetakerSession[]) {
  const botIds = sessions.map((s) => String(s.botId || "").trim()).filter(Boolean);
  // UI catalog must not Retrieve Bot — cron owns throttled lifecycle checks.
  await drivePersistForBotIds(botIds, { bypassThrottle: true, skipRecallFetch: true });
}

/** Persist transcripts for unified-scheduled bots once their meeting window has passed. */
export async function autoPersistUnifiedScheduledBots(options?: { skipRecallFetch?: boolean }) {
  const rows = await listAllUnifiedScheduledBotSessions();
  await drivePersistForBotIds(rows.map((r) => r.botId), {
    bypassThrottle: true,
    skipRecallFetch: options?.skipRecallFetch !== false,
  });
}

/** S3 persist + index merge (slow). Runs in background after fast session list returns. */
export async function maintainNotetakerSessionsCatalog(sessions: NotetakerSession[]) {
  await autoPersistDiscoverableSessions(sessions);
  await autoPersistUnifiedScheduledBots();
  const { mergeSessionsIndexToS3, invalidatePersistedSessionsS3Cache } = await import(
    "@/lib/notetaker-sessions-history.server"
  );
  await mergeSessionsIndexToS3(sessions);
  invalidatePersistedSessionsS3Cache();
}

export function scheduleNotetakerCatalogMaintenance(sessions: NotetakerSession[]) {
  const now = Date.now();
  if (now - lastCatalogMaintenanceAt < catalogMaintenanceMinMs()) return;
  lastCatalogMaintenanceAt = now;
  void maintainNotetakerSessionsCatalog(sessions).catch(() => {});
}
