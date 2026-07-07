import { canonicalOfficialEmail } from "@/lib/cintara-email";
import type { EmployeePickerEntry } from "@/lib/employee-picker-types";
import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import {
  markdownToEmailHtml,
  markdownToPlainEmailText,
  wrapMeetingNotesEmailHtml,
} from "@/lib/markdown-email.server";
import { buildMeetingNotesEmailSubject } from "@/lib/meeting-notes-email-subject";
import { resolveMeetingParticipants } from "@/lib/notetaker-meeting-participants.server";
import { loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import { getNotesMdFromS3 } from "@/lib/notetaker-s3-calendar.server";
import { getSesFromAddress, sendSesEmail, sesConfigured } from "@/lib/ses-mail.server";
import {
  resolveRosterPersonEmail,
  type SpeakerIdentityIndex,
} from "@/lib/speaker-identity";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";
import { isSpeakerIdentityExcluded } from "@/lib/speaker-identity-overrides";

const CINTARA_DOMAIN = "cintara.ai";

export type MeetingNotesEmailRecipient = {
  name: string;
  email: string;
  source: "calendar" | "transcript" | "roster" | "manual";
};

export type MeetingNotesEmailPreview = {
  configured: boolean;
  fromAddress: string;
  subject: string;
  /** Email body H1 heading (defaults to meeting title). */
  heading: string;
  meetingStartAt?: string | null;
  recipients: MeetingNotesEmailRecipient[];
  unmapped: Array<{ name: string; source: "calendar" | "transcript" }>;
  warnings: string[];
  canSend: boolean;
};

export type MeetingNotesEmailSendResult = {
  sent: boolean;
  messageId?: string;
  recipients: string[];
  subject: string;
  warnings: string[];
};

function isAllowedMeetingRecipientEmail(email: string): boolean {
  const e = canonicalOfficialEmail(email).toLowerCase();
  if (e.endsWith(`@${CINTARA_DOMAIN}`) || e.endsWith("@revcloud.com")) return true;
  if (e.endsWith("@betterpeoplesupport.com")) return true;
  return false;
}

function resolveNameToMeetingEmail(
  label: string,
  identity: SpeakerIdentityIndex,
  roster: EmployeePickerEntry[],
): { email: string | null; name: string } {
  const { email, name } = resolveRosterPersonEmail(label, identity, roster);
  if (!email) return { email: null, name };
  if (!isAllowedMeetingRecipientEmail(email)) return { email: null, name };
  return { email: canonicalOfficialEmail(email), name };
}

export async function resolveMeetingNotesRecipientEmails(botId: string): Promise<{
  recipients: MeetingNotesEmailRecipient[];
  unmapped: Array<{ name: string; source: "calendar" | "transcript" }>;
  warnings: string[];
}> {
  const id = String(botId || "").trim();
  if (!id) return { recipients: [], unmapped: [], warnings: ["Missing bot id"] };

  const indexDoc = await loadBotIndexDoc(id).catch(() => null);
  const participants = await resolveMeetingParticipants({
    botId: id,
    transcriptKey: indexDoc?.transcriptKey,
    hasTranscript: Boolean(indexDoc?.transcriptKey),
  });

  const [{ index: identity, warnings: identityWarnings }, roster] = await Promise.all([
    getSpeakerIdentityIndex(),
    loadEmployeePickerDirectory(),
  ]);

  const activeRoster = roster.employees.filter((e) => !isSpeakerIdentityExcluded(e));
  const warnings = identityWarnings.slice(0, 4);
  const byEmail = new Map<string, MeetingNotesEmailRecipient>();
  const unmapped: Array<{ name: string; source: "calendar" | "transcript" }> = [];

  for (const p of participants) {
    const source = p.source === "calendar" ? "calendar" : "transcript";
    const { email, name } = resolveNameToMeetingEmail(p.name, identity, activeRoster);
    if (email) {
      const key = email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, { name, email, source });
      }
      continue;
    }
    unmapped.push({ name: p.name, source });
  }

  const recipients = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!recipients.length) {
    warnings.push("No participant emails could be resolved for this meeting.");
  }
  if (unmapped.length) {
    warnings.push(
      `${unmapped.length} participant name(s) could not be mapped to a known email — they will not receive this email.`,
    );
  }

  return { recipients, unmapped, warnings };
}

async function loadNotesMarkdown(botId: string, notesMdOverride?: string): Promise<{ notesMd: string; title: string }> {
  const override = String(notesMdOverride || "").trim();
  const indexDoc = await loadBotIndexDoc(botId).catch(() => null);
  const title = String(indexDoc?.title || "Meeting").trim() || "Meeting";

  if (override) return { notesMd: override, title };

  if (indexDoc?.notesKey) {
    const notesMd = (await getNotesMdFromS3({ notesKey: indexDoc.notesKey })).trim();
    if (notesMd) return { notesMd, title };
  }

  throw new Error("No meeting notes found. Generate and persist notes before sending email.");
}

function buildEmailSubject(title: string, meetingStartAt?: string | null): string {
  return buildMeetingNotesEmailSubject(title, meetingStartAt);
}

function meetingDateLabel(meetingStartAt?: string | null): string | undefined {
  if (!meetingStartAt) return undefined;
  const d = new Date(meetingStartAt);
  if (!Number.isFinite(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export async function previewMeetingNotesEmail(args: {
  botId: string;
  notesMd?: string;
  title?: string;
}): Promise<MeetingNotesEmailPreview> {
  const { recipients, unmapped, warnings } = await resolveMeetingNotesRecipientEmails(args.botId);
  const indexDoc = await loadBotIndexDoc(args.botId).catch(() => null);
  const title = String(args.title || indexDoc?.title || "Meeting").trim() || "Meeting";
  const subject = buildEmailSubject(title, indexDoc?.finalizedAt || null);

  let notesWarning: string | null = null;
  try {
    const { notesMd } = await loadNotesMarkdown(args.botId, args.notesMd);
    if (!notesMd.trim()) notesWarning = "Notes are empty.";
  } catch (e) {
    notesWarning = e instanceof Error ? e.message : "Notes unavailable";
  }

  const allWarnings = [...warnings];
  if (notesWarning) allWarnings.push(notesWarning);
  if (!sesConfigured()) {
    allWarnings.push("SES is not configured (AWS credentials + SES_FROM_EMAIL).");
  }

  return {
    configured: sesConfigured(),
    fromAddress: getSesFromAddress(),
    subject,
    heading: title,
    meetingStartAt: indexDoc?.finalizedAt || null,
    recipients,
    unmapped,
    warnings: allWarnings,
    canSend: sesConfigured() && recipients.length > 0 && !notesWarning,
  };
}

function normalizeRecipientEmail(email: string): string {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) return "";
  const domain = trimmed.split("@")[1] || "";
  if (domain === CINTARA_DOMAIN || domain === "revcloud.com") {
    return canonicalOfficialEmail(trimmed);
  }
  return trimmed;
}

export async function sendMeetingNotesEmail(args: {
  botId: string;
  notesMd?: string;
  title?: string;
  subject?: string;
  heading?: string;
  recipients?: Array<{ name: string; email: string }>;
}): Promise<MeetingNotesEmailSendResult> {
  if (!sesConfigured()) {
    throw new Error("AWS SES is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL.");
  }

  const overrideRecipients = (args.recipients ?? [])
    .map((r) => ({
      name: String(r.name || "").trim(),
      email: normalizeRecipientEmail(r.email),
      source: "manual" as const,
    }))
    .filter((r) => r.name && r.email);

  const deduped = new Map<string, MeetingNotesEmailRecipient>();
  for (const r of overrideRecipients) {
    deduped.set(r.email.toLowerCase(), r);
  }

  const resolved = await resolveMeetingNotesRecipientEmails(args.botId);
  const recipients = overrideRecipients.length ? [...deduped.values()] : resolved.recipients;
  const warnings = overrideRecipients.length ? [] : resolved.warnings;

  if (!recipients.length) {
    throw new Error("No recipient emails to send to.");
  }

  for (const r of recipients) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      throw new Error(`Invalid email address: ${r.email}`);
    }
  }

  const indexDoc = await loadBotIndexDoc(args.botId).catch(() => null);
  const { notesMd, title: loadedTitle } = await loadNotesMarkdown(args.botId, args.notesMd);
  const defaultTitle = String(args.title || loadedTitle || "Meeting").trim() || "Meeting";
  const heading = String(args.heading || defaultTitle).trim() || defaultTitle;
  const subject =
    String(args.subject || "").trim() ||
    buildEmailSubject(defaultTitle, indexDoc?.finalizedAt || null);
  const bodyHtml = markdownToEmailHtml(notesMd);
  const html = wrapMeetingNotesEmailHtml({
    title: heading,
    meetingDateLabel: meetingDateLabel(indexDoc?.finalizedAt || null),
    bodyHtml,
    appUrl: process.env.ALYSON_APP_BASE_URL?.trim() || process.env.VITE_ALYSON_APP_BASE_URL?.trim(),
  });
  const text = [
    heading,
    "",
    markdownToPlainEmailText(notesMd),
    "",
    "— Alyson Notetaker",
  ].join("\n");

  const sent = await sendSesEmail({
    to: recipients.map((r) => r.email),
    subject,
    html,
    text,
    replyTo: [getSesFromAddress().match(/<([^>]+)>/)?.[1] || "notetaker@cintara.ai"],
  });

  return {
    sent: true,
    messageId: sent.messageId,
    recipients: sent.recipients,
    subject,
    warnings,
  };
}
