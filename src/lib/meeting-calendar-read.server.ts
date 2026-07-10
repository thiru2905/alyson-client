import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";
import { getMeetingUrl } from "@/lib/unifiedMeetingsService";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

const SKIP_TITLE_KEYWORDS = [
  "out of office",
  "ooo",
  "focus time",
  "focus block",
  "inner time",
  "lunch",
  "break",
  "holiday",
  "blocked",
  "busy",
  "do not book",
  "no meetings",
] as const;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function googleCalendarDwdConfigured(): boolean {
  const hasCreds = Boolean(
    process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
  return Boolean(process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim() && hasCreds);
}

async function loadServiceAccountJwtForSubject(subject: string, scopes: string[]) {
  let parsed: { client_email?: string; private_key?: string };
  const inlineJson = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    parsed = JSON.parse(inlineJson) as { client_email?: string; private_key?: string };
  } else {
    const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
    const txt = await fs.readFile(credentialsPath, "utf8");
    parsed = JSON.parse(txt) as { client_email?: string; private_key?: string };
  }

  const clientEmail = parsed.client_email || env("GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL");
  const privateKey = parsed.private_key;
  if (!privateKey) {
    throw new Error(
      "Failed to load private_key from GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject,
  });
}

export async function listCalendarEventsForUser(
  email: string,
  timeMin: string,
  timeMax: string,
): Promise<any[]> {
  const auth = await loadServiceAccountJwtForSubject(email, [CALENDAR_SCOPE]);
  const calendar = google.calendar({ version: "v3", auth });
  const out: any[] = [];
  let pageToken: string | undefined;
  do {
    const r = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      pageToken,
      maxResults: 250,
    });
    out.push(...(r.data.items ?? []));
    pageToken = r.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

function containsSkipKeywords(title: string): boolean {
  const t = title.toLowerCase();
  return SKIP_TITLE_KEYWORDS.some((k) => t.includes(k));
}

/** Real meetings only — must have a join URL; skip focus / OOO / placeholder blocks. */
export function meetingEventSkipReason(event: any, meetingUrl: string | null): string | null {
  const status = String(event?.status || "");
  if (status === "cancelled") return "Event is cancelled";
  if (!meetingUrl) return "No meeting URL";
  if (!event?.start?.dateTime) return "Missing start dateTime";
  const eventType = String(event?.eventType || "");
  if (eventType === "outOfOffice" || eventType === "focusTime") {
    return `Skipped eventType ${eventType}`;
  }
  const title = String(event?.summary || "Untitled meeting");
  if (containsSkipKeywords(title)) return "Skipped by title keyword";
  return null;
}

export function meetingEventDurationHours(event: any): number {
  const startMs = new Date(String(event?.start?.dateTime || "")).getTime();
  const endMs = new Date(String(event?.end?.dateTime || "")).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return (endMs - startMs) / 3_600_000;
}

export type EligibleCalendarMeeting = {
  title: string;
  startTime: string;
  endTime: string | null;
  meetingUrl: string;
  durationHours: number;
};

export function parseEligibleCalendarMeeting(event: any): EligibleCalendarMeeting | null {
  const meetingUrl = getMeetingUrl(event);
  if (meetingEventSkipReason(event, meetingUrl)) return null;
  const startTime = String(event?.start?.dateTime || "");
  const durationHours = meetingEventDurationHours(event);
  if (durationHours <= 0) return null;
  return {
    title: String(event?.summary || "Untitled meeting").trim() || "Untitled meeting",
    startTime,
    endTime: event?.end?.dateTime ? String(event.end.dateTime) : null,
    meetingUrl: meetingUrl!,
    durationHours,
  };
}
