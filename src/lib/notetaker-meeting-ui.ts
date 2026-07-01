export type NotetakerMeetingRow = {
  prefix: string;
  botId: string | null;
  day: string;
  title: string;
  startedAt: string | null;
  notesKey: string | null;
  transcriptKey: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
};

export type MeetingListParticipant = {
  name: string;
  source: "transcript" | "calendar";
  utterances?: number;
  words?: number;
};

export function meetingNotesKey(m: NotetakerMeetingRow): string {
  return m.notesKey ?? `alyson-notetaker/meetingnotes/${m.prefix}/notes.md`;
}

export function meetingTranscriptKey(m: NotetakerMeetingRow): string {
  return m.transcriptKey ?? `alyson-notetaker/transcripts/${m.prefix}/transcript.txt`;
}

export function formatMeetingDate(startedAt: string | null, day: string) {
  if (startedAt) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  const d = new Date(`${day}T12:00:00Z`);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return day;
}

export function formatMeetingTime(startedAt: string | null, day: string) {
  if (!startedAt) return formatMeetingDate(null, day);
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return formatMeetingDate(null, day);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Date once + time — for Meeting List cards (no duplicate weekday/date). */
export function formatMeetingListWhen(startedAt: string | null, day: string) {
  if (startedAt) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) {
      const date = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      const time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      });
      return `${date} · ${time}`;
    }
  }
  return formatMeetingDate(null, day);
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function addMonths(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
}

export function monthLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
