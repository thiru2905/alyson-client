export type NotetakerMeetingRow = {
  prefix: string;
  botId: string | null;
  day: string;
  title: string;
  startedAt: string | null;
  notesKey: string | null;
  transcriptKey: string | null;
  tasksKey: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
  hasTasks?: boolean;
};

export type MeetingListParticipant = {
  name: string;
  source: "transcript" | "calendar";
  utterances?: number;
  words?: number;
};

export type MeetingListTask = {
  title: string;
  dueHint: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "done" | "unclear";
  sourceQuote: string | null;
};

export type MeetingListPersonTasks = {
  personKey: string;
  name: string;
  email: string | null;
  tasks: MeetingListTask[];
};

export function meetingNotesKey(m: NotetakerMeetingRow): string {
  return m.notesKey ?? `alyson-notetaker/meetingnotes/${m.prefix}/notes.md`;
}

export function meetingTranscriptKey(m: NotetakerMeetingRow): string {
  return m.transcriptKey ?? `alyson-notetaker/transcripts/${m.prefix}/transcript.txt`;
}

export function meetingTasksKey(m: NotetakerMeetingRow): string {
  return m.tasksKey ?? `alyson-notetaker/meetingtasks/${m.prefix}/tasks.json`;
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

export function formatMeetingDayHeading(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return label;
}

export function groupMeetingsByDay(meetings: NotetakerMeetingRow[]) {
  const deduped = dedupeMeetingRowsForDisplay(meetings);
  const groups = new Map<string, NotetakerMeetingRow[]>();
  for (const meeting of deduped) {
    const arr = groups.get(meeting.day) ?? [];
    arr.push(meeting);
    groups.set(meeting.day, arr);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      label: formatMeetingDayHeading(day),
      meetings: items.sort((a, b) => (b.startedAt || b.day).localeCompare(a.startedAt || a.day)),
    }));
}

/** Client-side: collapse near-duplicates only (same day + title + ~15 min). Keep "test". */
export function dedupeMeetingRowsForDisplay(meetings: NotetakerMeetingRow[]): NotetakerMeetingRow[] {
  const NEAR_MS = 15 * 60_000;
  const normalize = (title: string) =>
    String(title || "")
      .trim()
      .toLowerCase()
      .replace(/^\d{8}[\s\-_]*/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isUntitled = (key: string) =>
    !key ||
    key === "meeting" ||
    key === "live meeting" ||
    key === "untitled meeting" ||
    key === "live unified meeting" ||
    key === "scheduled meeting" ||
    key === "unified meeting";

  const sorted = [...meetings].sort((a, b) =>
    (a.startedAt || a.day).localeCompare(b.startedAt || b.day),
  );
  const kept: NotetakerMeetingRow[] = [];

  for (const meeting of sorted) {
    const titleKey = normalize(meeting.title);
    if (isUntitled(titleKey)) continue;

    const rowMs = Date.parse(String(meeting.startedAt || ""));
    let merged = false;

    for (let i = 0; i < kept.length; i++) {
      const prev = kept[i]!;
      if (prev.day !== meeting.day) continue;
      if (normalize(prev.title) !== titleKey) continue;

      const prevMs = Date.parse(String(prev.startedAt || ""));
      const close =
        Number.isFinite(prevMs) && Number.isFinite(rowMs)
          ? Math.abs(prevMs - rowMs) <= NEAR_MS
          : !meeting.startedAt || !prev.startedAt;

      if (!close) continue;

      const prevScore =
        (prev.hasTranscript ? 4 : 0) + (prev.hasNotes ? 2 : 0) + (prev.hasTasks ? 1 : 0);
      const nextScore =
        (meeting.hasTranscript ? 4 : 0) + (meeting.hasNotes ? 2 : 0) + (meeting.hasTasks ? 1 : 0);
      if (nextScore > prevScore) kept[i] = meeting;
      else if (
        nextScore === prevScore &&
        meeting.startedAt &&
        (!prev.startedAt || meeting.startedAt < prev.startedAt)
      ) {
        kept[i] = meeting;
      }
      merged = true;
      break;
    }

    if (!merged) kept.push(meeting);
  }

  return kept;
}

export function monthLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
