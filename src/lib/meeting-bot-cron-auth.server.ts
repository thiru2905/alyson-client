/** Bearer auth for `/api/cron/meeting-bot-schedule`. */
export function assertMeetingBotCronAuth(request: Request): Response | null {
  const secret =
    process.env.MEETING_BOT_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "MEETING_BOT_CRON_SECRET (or CRON_SECRET) is not configured" },
        { status: 503 },
      );
    }
    return null;
  }
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
