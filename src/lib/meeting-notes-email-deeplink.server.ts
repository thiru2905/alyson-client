/** Absolute URL to Meeting Calendar with this meeting’s transcript (or notes) open. */
export function buildNotetakerMeetingCalendarDeepLink(args: {
  botId: string;
  meetingDay?: string | null;
  prefix?: string | null;
  transcriptKey?: string | null;
  notesKey?: string | null;
  open?: "transcript" | "notes" | "tasks";
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
  params.set("open", open);
  if (args.meetingDay && /^\d{4}-\d{2}-\d{2}$/.test(args.meetingDay)) {
    params.set("day", args.meetingDay);
  }
  const prefix = String(args.prefix || "").trim();
  if (prefix) params.set("prefix", prefix);
  const transcriptKey = String(args.transcriptKey || "").trim();
  if (transcriptKey) params.set("transcriptKey", transcriptKey);
  const notesKey = String(args.notesKey || "").trim();
  if (notesKey && open === "notes") params.set("notesKey", notesKey);

  return `${base}/alyson-notetaker/calendar?${params.toString()}`;
}
