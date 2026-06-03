import { Resend } from "resend";

export function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function getResendFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Alyson HR <onboarding@resend.dev>"
  );
}

export function getResendClient() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export type ResendAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
};

export async function sendResendEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
}) {
  if (!args.to.length) throw new Error("No recipients configured");
  const resend = getResendClient();
  const attachments = args.attachments?.map((a) => ({
    filename: a.filename,
    content:
      typeof a.content === "string"
        ? Buffer.from(a.content, "utf8")
        : Buffer.isBuffer(a.content)
          ? a.content
          : Buffer.from(a.content),
  }));

  const { data, error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    attachments,
  });
  if (error) throw new Error(error.message);
  return data;
}

export function assertDailyReportCronAuth(request: Request): Response | null {
  const secret =
    process.env.DAILY_REPORT_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "DAILY_REPORT_CRON_SECRET (or CRON_SECRET) is not configured" },
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
