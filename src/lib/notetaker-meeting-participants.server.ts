import { getTranscriptTextFromS3 } from "@/lib/notetaker-s3-calendar.server";
import { loadPersistedSessionPayloadFromS3 } from "@/lib/notetaker-sessions-history.server";
import { parseTranscriptUtterances, rollupSpeakers } from "@/lib/notetaker-transcript-parse.server";

export type MeetingParticipant = {
  name: string;
  source: "transcript" | "calendar";
  utterances?: number;
  words?: number;
};

function participantKey(name: string) {
  return name.trim().toLowerCase();
}

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mergeParticipant(into: Map<string, MeetingParticipant>, next: MeetingParticipant) {
  const key = participantKey(next.name);
  if (!key) return;
  const existing = into.get(key);
  if (!existing) {
    into.set(key, next);
    return;
  }
  if (next.source === "transcript") {
    into.set(key, {
      ...existing,
      ...next,
      name: next.name || existing.name,
      source: "transcript",
    });
    return;
  }
  if (existing.source !== "transcript") {
    into.set(key, existing);
  }
}

function speakersFromTranscriptText(transcriptText: string): MeetingParticipant[] {
  return rollupSpeakers(parseTranscriptUtterances(transcriptText)).map((s) => ({
    name: s.speaker,
    source: "transcript" as const,
    utterances: s.utterances,
    words: s.words,
  }));
}

async function speakersFromTranscriptKey(transcriptKey: string): Promise<MeetingParticipant[]> {
  try {
    const transcriptText = await getTranscriptTextFromS3({ transcriptKey });
    return speakersFromTranscriptText(transcriptText);
  } catch {
    return [];
  }
}

async function speakersFromBotId(botId: string): Promise<MeetingParticipant[]> {
  try {
    const payload = await loadPersistedSessionPayloadFromS3(botId);
    if (!payload?.lines?.length) return [];
    const transcriptText = payload.lines
      .map((line) => `${line.participant?.name || "Speaker"}: ${line.text || ""}`)
      .join("\n");
    return speakersFromTranscriptText(transcriptText);
  } catch {
    return [];
  }
}

export async function buildCalendarAttendeesByBotId(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const { getUnifiedMeetings } = await import("@/lib/unifiedMeetingsService");
    const { meetings } = await getUnifiedMeetings();
    for (const meeting of meetings) {
      const botId = String(meeting.recallBotId || "").trim();
      if (!botId || !meeting.attendees?.length) continue;
      out.set(botId, meeting.attendees);
    }
  } catch {
    // calendar scan optional
  }
  return out;
}

export async function resolveMeetingParticipants(args: {
  transcriptKey?: string | null;
  botId?: string | null;
  hasTranscript?: boolean;
  calendarByBot?: Map<string, string[]>;
  /** When already loaded (e.g. Meeting List bundle), skip duplicate S3 read. */
  transcriptText?: string | null;
}): Promise<MeetingParticipant[]> {
  const merged = new Map<string, MeetingParticipant>();

  if (args.transcriptText) {
    for (const speaker of speakersFromTranscriptText(args.transcriptText)) {
      mergeParticipant(merged, speaker);
    }
  } else if (args.transcriptKey && args.hasTranscript !== false) {
    for (const speaker of await speakersFromTranscriptKey(args.transcriptKey)) {
      mergeParticipant(merged, speaker);
    }
  }

  if (merged.size === 0 && args.botId) {
    for (const speaker of await speakersFromBotId(args.botId)) {
      mergeParticipant(merged, speaker);
    }
  }

  if (args.botId) {
    const calendar =
      args.calendarByBot?.get(args.botId) ??
      (await buildCalendarAttendeesByBotId()).get(args.botId) ??
      [];
    for (const email of calendar) {
      mergeParticipant(merged, {
        name: email.includes("@") ? displayNameFromEmail(email) : email,
        source: "calendar",
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.source !== b.source) return a.source === "transcript" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
