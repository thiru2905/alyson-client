import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";
import { drivePersistForBotIds } from "@/lib/notetaker-session-persist-drive.server";
import { ENDED_SESSION_STATUSES } from "@/lib/notetaker-session-status.server";
import { listAllUnifiedScheduledBotSessions } from "@/lib/unifiedMeetingsService";

export { ENDED_SESSION_STATUSES };

let lastCatalogMaintenanceAt = 0;

function catalogMaintenanceMinMs() {
  const n = Number(process.env.NOTETAKER_CATALOG_MAINTENANCE_MIN_MS || 30_000);
  return Number.isFinite(n) && n >= 10_000 ? Math.min(n, 120_000) : 30_000;
}

/** Persist every discoverable bot transcript to S3 (upstream status + idle heuristics). */
export async function autoPersistDiscoverableSessions(sessions: NotetakerSession[]) {
  const botIds = sessions.map((s) => String(s.botId || "").trim()).filter(Boolean);
  await drivePersistForBotIds(botIds, { bypassThrottle: true });
}

/** Persist transcripts for unified-scheduled bots once their meeting window has passed. */
export async function autoPersistUnifiedScheduledBots() {
  const rows = await listAllUnifiedScheduledBotSessions();
  await drivePersistForBotIds(
    rows.map((r) => r.botId),
    { bypassThrottle: true },
  );
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
