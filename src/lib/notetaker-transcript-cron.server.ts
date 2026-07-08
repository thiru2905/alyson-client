import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";
import { ensureMeetingNotesInS3 } from "@/lib/notetaker-auto-persist.server";
import { notetakerTranscriptCronEnabled } from "@/lib/notetaker-cron-auth.server";
import { autoPersistUnifiedScheduledBots } from "@/lib/notetaker-session-catalog.server";
import { driveSessionPersistToS3 } from "@/lib/notetaker-session-persist-drive.server";
import {
  listPersistedSessionsFromS3,
  mergeSessionsIndexToS3,
  invalidatePersistedSessionsS3Cache,
  listAllBotIndexDocs,
} from "@/lib/notetaker-sessions-history.server";
import { listAllUnifiedScheduledBotSessions } from "@/lib/unifiedMeetingsService";
import { notetakerUpstream } from "@/lib/notetaker-upstream.server";
import { runRecallMediaCleanup, type RecallMediaCleanupResult } from "@/lib/notetaker-recall-media-cleanup.server";
import { activateDueScheduledBotSessions } from "@/lib/notetaker-scheduled-bot-activation.server";

export type NotetakerTranscriptCronResult = {
  ok: boolean;
  ranAt: string;
  enabled: boolean;
  scanned: number;
  written: number;
  notesWritten: number;
  skippedUnchanged: number;
  skippedFinalized: number;
  newlyFinalized: number;
  skippedEmpty: number;
  upstreamUnavailable: number;
  errors: number;
  warnings: string[];
  recallMediaCleanup?: RecallMediaCleanupResult;
  scheduledBotActivation?: Awaited<ReturnType<typeof activateDueScheduledBotSessions>>;
  meetingIntegrity?: {
    scanned: number;
    repaired: number;
    superseded: number;
    issueCount: number;
  };
};

async function collectBotIds(): Promise<{ botIds: Set<string>; warnings: string[] }> {
  const botIds = new Set<string>();
  const warnings: string[] = [];

  try {
    const data = (await notetakerUpstream("/api/sessions")) as { sessions?: NotetakerSession[] };
    for (const s of data.sessions ?? []) {
      const id = String(s.botId || "").trim();
      if (id) botIds.add(id);
    }
  } catch (e) {
    warnings.push(`upstream_sessions: ${String(e)}`);
  }

  try {
    const unified = await listAllUnifiedScheduledBotSessions();
    for (const r of unified) {
      const id = String(r.botId || "").trim();
      if (id) botIds.add(id);
    }
  } catch (e) {
    warnings.push(`unified_scheduled: ${String(e)}`);
  }

  try {
    const s3Sessions = await listPersistedSessionsFromS3({ includeBotIndex: true });
    for (const s of s3Sessions) {
      const id = String(s.botId || "").trim();
      if (id) botIds.add(id);
    }
  } catch (e) {
    warnings.push(`s3_bot_index: ${String(e)}`);
  }

  return { botIds, warnings };
}

const MAX_RECALL_BACKFILLS_PER_CRON = 8;

function isCronFinalizedBot(
  botId: string,
  indexByBotId: Map<string, { cronFinalized?: boolean; transcriptKey?: string; transcriptHash?: string }>,
): boolean {
  const index = indexByBotId.get(botId);
  return Boolean(index?.cronFinalized && index.transcriptKey && index.transcriptHash);
}

/**
 * Cron-safe transcript dump: scans every known bot, fetches upstream lines,
 * writes to S3 only when content hash changes (no duplicate dumps).
 */
export async function runNotetakerTranscriptCron(): Promise<NotetakerTranscriptCronResult> {
  const ranAt = new Date().toISOString();
  if (!notetakerTranscriptCronEnabled()) {
    return {
      ok: true,
      ranAt,
      enabled: false,
      scanned: 0,
      written: 0,
      notesWritten: 0,
      skippedUnchanged: 0,
      skippedFinalized: 0,
      newlyFinalized: 0,
      skippedEmpty: 0,
      upstreamUnavailable: 0,
      errors: 0,
      warnings: ["NOTETAKER_TRANSCRIPT_CRON_ENABLED=false"],
    };
  }

  const warnings: string[] = [];
  let scheduledBotActivation: Awaited<ReturnType<typeof activateDueScheduledBotSessions>> | undefined;
  try {
    scheduledBotActivation = await activateDueScheduledBotSessions();
  } catch (e) {
    warnings.push(`scheduled_bot_activation: ${String(e)}`);
  }

  const { botIds, warnings: collectWarnings } = await collectBotIds();
  warnings.push(...collectWarnings);

  let indexByBotId = new Map<string, { cronFinalized?: boolean; transcriptKey?: string; transcriptHash?: string }>();
  try {
    const docs = await listAllBotIndexDocs();
    indexByBotId = new Map(docs.map((doc) => [String(doc.botId || "").trim(), doc]));
  } catch (e) {
    warnings.push(`bot_index_prefetch: ${String(e)}`);
  }

  let written = 0;
  let notesWritten = 0;
  let skippedUnchanged = 0;
  let skippedFinalized = 0;
  let newlyFinalized = 0;
  let skippedEmpty = 0;
  let upstreamUnavailable = 0;
  let errors = 0;
  let recallBackfillsAttempted = 0;

  for (const botId of botIds) {
    try {
      const skipRecall = isCronFinalizedBot(botId, indexByBotId);
      const driveResult = await driveSessionPersistToS3(botId, {
        bypassThrottle: true,
        skipRecallFetch: skipRecall,
      });
      if (driveResult === "written") {
        written += 1;
        const notes = await ensureMeetingNotesInS3(botId);
        if (notes.ok && notes.notesMd?.trim()) {
          notesWritten += 1;
          const { maybeGenerateMeetingTasksWhenReady } = await import(
            "@/lib/notetaker-meeting-list-tasks.server"
          );
          void maybeGenerateMeetingTasksWhenReady(botId);
        }
      } else if (driveResult === "unchanged" || driveResult === "skipped_complete") {
        skippedUnchanged += 1;
        if (driveResult === "skipped_complete") skippedFinalized += 1;
      } else if (driveResult === "empty") {
        skippedEmpty += 1;
        if (!skipRecall && recallBackfillsAttempted < MAX_RECALL_BACKFILLS_PER_CRON) {
          recallBackfillsAttempted += 1;
          try {
            const { backfillTranscriptFromRecall } = await import("@/lib/recall/recall-transcript-backfill.server");
            const backfill = await backfillTranscriptFromRecall(botId);
            if (backfill.ok && backfill.persisted) {
              written += 1;
              skippedEmpty -= 1;
              const notes = await ensureMeetingNotesInS3(botId);
              if (notes.ok && notes.notesMd?.trim()) notesWritten += 1;
            }
          } catch {
            // backfill is best-effort
          }
        }
      } else if (driveResult === "unavailable") {
        upstreamUnavailable += 1;
      } else {
        errors += 1;
      }
    } catch (e) {
      errors += 1;
      warnings.push(`${botId}: ${String(e)}`);
    }
  }

  try {
    await autoPersistUnifiedScheduledBots();
  } catch (e) {
    warnings.push(`unified_persist: ${String(e)}`);
  }

  try {
    const { buildNotetakerSessionsList } = await import("@/lib/notetaker-sessions-list.server");
    const live = await buildNotetakerSessionsList();
    await mergeSessionsIndexToS3(live.sessions ?? []);
    invalidatePersistedSessionsS3Cache();
  } catch (e) {
    warnings.push(`sessions_index: ${String(e)}`);
  }

  let recallMediaCleanup: RecallMediaCleanupResult | undefined;
  try {
    recallMediaCleanup = await runRecallMediaCleanup();
  } catch (e) {
    warnings.push(`recall_media_cleanup: ${String(e)}`);
  }

  try {
    const { runUnifiedMeetingsBackgroundMaintenance } = await import("@/lib/unified-meetings-background.server");
    const um = await runUnifiedMeetingsBackgroundMaintenance();
    if (um.warnings.length) warnings.push(...um.warnings);
    if (um.calendarBotsScheduled > 0) {
      warnings.push(`unified_meetings: scheduled ${um.calendarBotsScheduled} calendar bot(s)`);
    }
  } catch (e) {
    warnings.push(`unified_meetings: ${String(e)}`);
  }

  try {
    const { leaveEmailSyncEnabled } = await import("@/lib/leave-email-schema");
    if (leaveEmailSyncEnabled()) {
      const { runLeaveEmailSync } = await import("@/lib/leave-email-sync.server");
      const leaveSync = await runLeaveEmailSync({ lookbackDays: 30, maxMessages: 50 });
      if (leaveSync.applied > 0) {
        warnings.push(`leave_email: applied ${leaveSync.applied} leave(s) to ledger`);
      }
      if (leaveSync.duplicates > 0) {
        warnings.push(`leave_email: ${leaveSync.duplicates} already on ledger (skipped)`);
      }
      if (leaveSync.errors.length) {
        warnings.push(`leave_email: ${leaveSync.errors[0]}`);
      }
    }
  } catch (e) {
    warnings.push(`leave_email: ${String(e)}`);
  }

  let meetingIntegrity: NotetakerTranscriptCronResult["meetingIntegrity"];
  try {
    const { runNotetakerMeetingIntegrityCheck } = await import(
      "@/lib/notetaker-meeting-integrity.server"
    );
    const integrity = await runNotetakerMeetingIntegrityCheck({ repair: true });
    meetingIntegrity = {
      scanned: integrity.scanned,
      repaired: integrity.repaired,
      superseded: integrity.superseded,
      issueCount: integrity.issues.length,
    };
    if (integrity.repaired > 0 || integrity.superseded > 0) {
      warnings.push(
        `meeting_integrity: repaired=${integrity.repaired} superseded=${integrity.superseded} issues=${integrity.issues.length}`,
      );
    }
  } catch (e) {
    warnings.push(`meeting_integrity: ${String(e)}`);
  }

  return {
    ok: errors === 0,
    ranAt,
    enabled: true,
    scanned: botIds.size,
    written,
    notesWritten,
    skippedUnchanged,
    skippedFinalized,
    newlyFinalized,
    skippedEmpty,
    upstreamUnavailable,
    errors,
    warnings: warnings.slice(0, 16),
    recallMediaCleanup,
    scheduledBotActivation,
    meetingIntegrity,
  };
}
