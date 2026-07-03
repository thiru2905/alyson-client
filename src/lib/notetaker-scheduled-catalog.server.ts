import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";
import {
  invalidatePersistedSessionsS3Cache,
  mergeSessionsIndexToS3,
} from "@/lib/notetaker-sessions-history.server";
import { buildDatedMeetingTitle } from "@/lib/notetaker-meeting-title.server";

export type ScheduledBotCatalogEntry = NotetakerSession & {
  /** Meeting occurrence start — used to prefix title with DDMMYYYY for recurring meetings. */
  meetingStartAt?: string;
};

/** Register a newly scheduled bot in the durable S3 session catalog immediately. */
export async function registerScheduledBotInSessionsCatalog(session: ScheduledBotCatalogEntry) {
  const botId = String(session.botId || "").trim();
  if (!botId) return;
  const baseTitle = session.title || "Scheduled meeting";
  const title = session.meetingStartAt
    ? buildDatedMeetingTitle(baseTitle, session.meetingStartAt)
    : baseTitle;
  try {
    await mergeSessionsIndexToS3([
      {
        botId,
        title,
        meetingUrl: session.meetingUrl,
        createdAt: session.createdAt || new Date().toISOString(),
        status: session.status || "scheduled",
      },
    ]);
    invalidatePersistedSessionsS3Cache();
  } catch {
    // scheduling still succeeded; list refresh may pick up from state file
  }
}
