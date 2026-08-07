import { isDevClerkBypass, requireClerkEmailFromSessionToken } from "@/lib/clerk-auth.server";
import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";
import { isMeetingFullAccessEmail } from "@/lib/meeting-visibility-constants";
import {
  buildCalendarAttendeesByBotId,
  resolveMeetingParticipants,
} from "@/lib/notetaker-meeting-participants.server";
import { listAllBotIndexDocs, loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";
import { resolveRosterPersonEmail } from "@/lib/speaker-identity";
import { isSpeakerIdentityExcluded } from "@/lib/speaker-identity-overrides";

export type MeetingVisibilityViewer = {
  email: string;
  fullAccess: boolean;
};

export type MeetingVisibilityRow = {
  botId?: string | null;
  prefix?: string | null;
  transcriptKey?: string | null;
  notesKey?: string | null;
  hasTranscript?: boolean;
};

function normalizeViewerEmail(email: string): string {
  return canonicalOfficialEmail(String(email || "").trim().toLowerCase());
}

export function viewerEmailMatches(viewerEmail: string, candidateEmail: string): boolean {
  const viewerKeys = new Set(emailLookupKeys(normalizeViewerEmail(viewerEmail)));
  for (const key of emailLookupKeys(canonicalOfficialEmail(candidateEmail))) {
    if (viewerKeys.has(key)) return true;
  }
  return false;
}

export async function resolveMeetingVisibilityViewer(
  clerkToken: string,
  emailHint?: string,
): Promise<MeetingVisibilityViewer> {
  let email: string;
  if (isDevClerkBypass()) {
    email = normalizeViewerEmail(emailHint || "");
    if (!email) {
      throw new Error(
        "Sign in required — set CLERK_SECRET_KEY in .env, or pass emailHint in development.",
      );
    }
  } else {
    email = normalizeViewerEmail(await requireClerkEmailFromSessionToken(clerkToken));
  }
  return { email, fullAccess: isMeetingFullAccessEmail(email) };
}

function prefixFromAssetKey(key: string): string | null {
  const m = String(key || "").match(
    /alyson-notetaker\/(?:transcripts|meetingnotes|meetingtasks)\/([^/]+)\//i,
  );
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function emailsForMeeting(args: {
  botId?: string | null;
  transcriptKey?: string | null;
  hasTranscript?: boolean;
  calendarByBot: Map<string, string[]>;
  identity: Awaited<ReturnType<typeof getSpeakerIdentityIndex>>["index"];
  roster: Awaited<ReturnType<typeof loadEmployeePickerDirectory>>["employees"];
}): Promise<Set<string>> {
  const emails = new Set<string>();
  const botId = String(args.botId || "").trim();

  if (botId) {
    const attendees = args.calendarByBot.get(botId) ?? [];
    for (const raw of attendees) {
      const e = canonicalOfficialEmail(raw).toLowerCase();
      if (e.includes("@")) emails.add(e);
    }
  }

  const participants = await resolveMeetingParticipants({
    botId: botId || null,
    transcriptKey: args.transcriptKey,
    hasTranscript: args.hasTranscript,
    calendarByBot: args.calendarByBot,
  });

  const activeRoster = args.roster.filter((e) => !isSpeakerIdentityExcluded(e));
  for (const p of participants) {
    const label = String(p.name || "").trim();
    if (!label) continue;
    if (label.includes("@")) {
      const e = canonicalOfficialEmail(label).toLowerCase();
      if (e.includes("@")) emails.add(e);
      continue;
    }
    const { email } = resolveRosterPersonEmail(label, args.identity, activeRoster);
    if (email) emails.add(canonicalOfficialEmail(email).toLowerCase());
  }

  return emails;
}

function viewerInEmailSet(viewerEmail: string, emails: Set<string>): boolean {
  for (const e of emails) {
    if (viewerEmailMatches(viewerEmail, e)) return true;
  }
  return false;
}

/**
 * Filter meeting rows to those the viewer may see (invited or present).
 * Full-access admins receive the full list unchanged.
 */
export async function filterMeetingsForViewer<T extends MeetingVisibilityRow>(
  meetings: T[],
  viewer: MeetingVisibilityViewer,
): Promise<T[]> {
  if (viewer.fullAccess) return meetings;
  if (!meetings.length) return [];

  const [calendarByBot, identityPack, rosterPack] = await Promise.all([
    buildCalendarAttendeesByBotId(),
    getSpeakerIdentityIndex(),
    loadEmployeePickerDirectory(),
  ]);
  const identity = identityPack.index;
  const roster = rosterPack.employees;

  const out: T[] = [];
  const needsDeep: T[] = [];

  for (const m of meetings) {
    const botId = String(m.botId || "").trim();
    if (botId) {
      const attendees = calendarByBot.get(botId) ?? [];
      if (attendees.some((a) => viewerEmailMatches(viewer.email, a))) {
        out.push(m);
        continue;
      }
    }
    needsDeep.push(m);
  }

  // Parallel with a modest concurrency to avoid melting S3 on big months.
  const CONCURRENCY = 8;
  for (let i = 0; i < needsDeep.length; i += CONCURRENCY) {
    const slice = needsDeep.slice(i, i + CONCURRENCY);
    const flags = await Promise.all(
      slice.map(async (m) => {
        const emails = await emailsForMeeting({
          botId: m.botId,
          transcriptKey: m.transcriptKey,
          hasTranscript: m.hasTranscript,
          calendarByBot,
          identity,
          roster,
        });
        return viewerInEmailSet(viewer.email, emails);
      }),
    );
    for (let j = 0; j < slice.length; j++) {
      if (flags[j]) out.push(slice[j]!);
    }
  }
  return out;
}

export async function assertViewerCanAccessMeetingAsset(args: {
  viewer: MeetingVisibilityViewer;
  botId?: string | null;
  prefix?: string | null;
  transcriptKey?: string | null;
  notesKey?: string | null;
}): Promise<void> {
  if (args.viewer.fullAccess) return;

  let botId = String(args.botId || "").trim() || null;
  let prefix = String(args.prefix || "").trim() || null;
  let transcriptKey = String(args.transcriptKey || "").trim() || null;
  const notesKey = String(args.notesKey || "").trim() || null;

  if (!prefix) {
    prefix = prefixFromAssetKey(transcriptKey || "") || prefixFromAssetKey(notesKey || "");
  }
  if (!transcriptKey && prefix) {
    transcriptKey = `alyson-notetaker/transcripts/${prefix}/transcript.txt`;
  }

  if (!botId && prefix) {
    const docs = await listAllBotIndexDocs();
    const hit = docs.find((d) => String(d.prefix || "").trim() === prefix);
    botId = hit?.botId ? String(hit.botId) : null;
    if (!transcriptKey && hit?.transcriptKey) transcriptKey = String(hit.transcriptKey);
  }

  if (botId && !transcriptKey) {
    const doc = await loadBotIndexDoc(botId).catch(() => null);
    if (doc?.transcriptKey) transcriptKey = String(doc.transcriptKey);
  }

  const [calendarByBot, identityPack, rosterPack] = await Promise.all([
    buildCalendarAttendeesByBotId(),
    getSpeakerIdentityIndex(),
    loadEmployeePickerDirectory(),
  ]);
  const emails = await emailsForMeeting({
    botId,
    transcriptKey,
    hasTranscript: Boolean(transcriptKey),
    calendarByBot,
    identity: identityPack.index,
    roster: rosterPack.employees,
  });

  if (!viewerInEmailSet(args.viewer.email, emails)) {
    throw new Error("Forbidden — you can only view meetings you were invited to or attended.");
  }
}

/** Filter live/persisted sessions by botId visibility. */
export async function filterSessionsForViewer<T extends { botId: string; meetingUrl?: string }>(
  sessions: T[],
  viewer: MeetingVisibilityViewer,
): Promise<T[]> {
  if (viewer.fullAccess) return sessions;
  if (!sessions.length) return [];

  const rows: MeetingVisibilityRow[] = sessions.map((s) => ({
    botId: s.botId,
    hasTranscript: true,
  }));
  const allowed = await filterMeetingsForViewer(rows, viewer);
  const allowedIds = new Set(
    allowed.map((r) => String(r.botId || "").trim()).filter(Boolean),
  );
  return sessions.filter((s) => allowedIds.has(String(s.botId || "").trim()));
}
