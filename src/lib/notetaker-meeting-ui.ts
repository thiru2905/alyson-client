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

/** Client-side integrity: collapse case/title duplicates shown on the same calendar day. */
export function dedupeMeetingRowsForDisplay(meetings: NotetakerMeetingRow[]): NotetakerMeetingRow[] {
  const byKey = new Map<string, NotetakerMeetingRow>();
  for (const meeting of meetings) {
    const titleKey = String(meeting.title || "")
      .trim()
      .toLowerCase()
      .replace(/^\d{8}[\s\-_]*/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "meeting";

    // Hide generic untitled clutter on the client too.
    if (
      !titleKey ||
      titleKey === "meeting" ||
      titleKey === "live meeting" ||
      titleKey === "untitled meeting"
    ) {
      continue;
    }

    const key = `${meeting.day}|${titleKey}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, meeting);
      continue;
    }
    const prevScore =
      (prev.hasTranscript ? 4 : 0) + (prev.hasNotes ? 2 : 0) + (prev.hasTasks ? 1 : 0);
    const nextScore =
      (meeting.hasTranscript ? 4 : 0) + (meeting.hasNotes ? 2 : 0) + (meeting.hasTasks ? 1 : 0);
    if (nextScore > prevScore) {
      byKey.set(key, meeting);
      continue;
    }
    if (nextScore < prevScore) continue;
    const prevStart = prev.startedAt || "";
    const nextStart = meeting.startedAt || "";
    if (nextStart && (!prevStart || nextStart < prevStart)) byKey.set(key, meeting);
  }
  return [...byKey.values()];
}

export function monthLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
