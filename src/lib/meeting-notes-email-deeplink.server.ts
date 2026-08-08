/** Absolute URL to Meeting Calendar (notes/tasks) or the dedicated transcript page. */
export function buildNotetakerMeetingCalendarDeepLink(args: {
  botId: string;
  meetingDay?: string | null;
  prefix?: string | null;
  transcriptKey?: string | null;
  notesKey?: string | null;
  open?: "transcript" | "notes" | "tasks";
  title?: string | null;
}): string | undefined {
  const base = (
    process.env.ALYSON_APP_BASE_URL?.trim() ||
    process.env.VITE_ALYSON_APP_BASE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
  if (!base) return undefined;

  const botId = String(args.botId || "").trim();
  if (!botId) return undefined;

  const open = args.open ?? "transcript";
  const params = new URLSearchParams();
  params.set("botId", botId);
  if (args.meetingDay && /^\d{4}-\d{2}-\d{2}$/.test(args.meetingDay)) {
    params.set("day", args.meetingDay);
  }
  const prefix = String(args.prefix || "").trim();
  if (prefix) params.set("prefix", prefix);
  const transcriptKey = String(args.transcriptKey || "").trim();
  if (transcriptKey) params.set("transcriptKey", transcriptKey);
  const notesKey = String(args.notesKey || "").trim();
  if (notesKey && open === "notes") params.set("notesKey", notesKey);
  const title = String(args.title || "").trim();
  if (title) params.set("title", title);

  if (open === "transcript") {
    if (!transcriptKey) {
      // Fall back to calendar deep-link so the app can resolve the meeting.
      params.set("open", "transcript");
      return `${base}/alyson-notetaker/calendar?${params.toString()}`;
    }
    return `${base}/alyson-notetaker/transcript?${params.toString()}`;
  }

  if (open === "notes") {
    if (!notesKey) {
      params.set("open", "notes");
      return `${base}/alyson-notetaker/calendar?${params.toString()}`;
    }
    return `${base}/alyson-notetaker/notes?${params.toString()}`;
  }

  params.set("open", open);
  return `${base}/alyson-notetaker/calendar?${params.toString()}`;
}
