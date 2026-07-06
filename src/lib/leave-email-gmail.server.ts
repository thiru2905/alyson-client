import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { googleDwdConfigured, loadGoogleDwdJwt } from "@/lib/google-dwd-jwt.server";
import {
  leaveEmailGmailUser,
  leaveEmailImpersonateMailbox,
  leaveEmailMailbox,
} from "@/lib/leave-email-schema";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type LeaveEmailMessage = {
  id: string;
  threadId: string;
  receivedAt: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
  bodyText: string;
};

export type LeaveEmailGmailReadMode = "delegated_inbox" | "impersonate_mailbox";

function parseFromHeader(raw: string): { name: string; email: string } {
  const s = String(raw || "").trim();
  const m = s.match(/<([^>]+)>/);
  const email = (m?.[1] || s).trim().toLowerCase();
  const name = m ? s.replace(/<[^>]+>/, "").replace(/"/g, "").trim() : email.split("@")[0] || "";
  return { name: name || email, email };
}

function decodeBody(data: string | null | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractPlainText(payload: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] } | null | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  const parts = payload.parts as Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }> | undefined;
  if (!parts?.length) return decodeBody(payload.body?.data);
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) return decodeBody(p.body.data);
  }
  for (const p of parts) {
    const nested = extractPlainText(p as typeof payload);
    if (nested.trim()) return nested;
  }
  return decodeBody(payload.body?.data);
}

function buildGmailSearchQuery(args: {
  mode: LeaveEmailGmailReadMode;
  mailbox: string;
  after: Date;
  before?: Date;
}): string {
  const after = format(args.after, "yyyy/MM/dd");
  const qParts = [`in:anywhere`, `after:${after}`];
  if (args.before) qParts.push(`before:${format(args.before, "yyyy/MM/dd")}`);

  if (args.mode === "delegated_inbox") {
    const addr = args.mailbox.replace(/"/g, "");
    qParts.push(
      `(to:${addr} OR cc:${addr} OR bcc:${addr} OR deliveredto:${addr} OR list:${addr})`,
    );
  }

  return qParts.join(" ");
}

async function createLeaveEmailGmailClient(): Promise<{
  gmail: gmail_v1.Gmail;
  mode: LeaveEmailGmailReadMode;
  impersonateUser: string;
  mailbox: string;
}> {
  const mailbox = leaveEmailMailbox();
  const scopes = [GMAIL_READONLY_SCOPE];

  if (leaveEmailImpersonateMailbox()) {
    const auth = await loadGoogleDwdJwt(mailbox, scopes);
    await auth.authorize();
    return {
      gmail: google.gmail({ version: "v1", auth }),
      mode: "impersonate_mailbox",
      impersonateUser: mailbox,
      mailbox,
    };
  }

  const impersonateUser = leaveEmailGmailUser();
  if (!impersonateUser) {
    throw new Error(
      "Missing GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL or LEAVE_EMAIL_GMAIL_USER for Gmail read (Workspace Activity uses the same admin user).",
    );
  }

  const auth = await loadGoogleDwdJwt(impersonateUser, scopes);
  await auth.authorize();
  return {
    gmail: google.gmail({ version: "v1", auth }),
    mode: "delegated_inbox",
    impersonateUser,
    mailbox,
  };
}

export function gmailConfigured(): boolean {
  return googleDwdConfigured() && Boolean(leaveEmailGmailUser() || leaveEmailImpersonateMailbox());
}

/** List People Ops mail via Gmail API (DWD — same auth path as Workspace Activity). */
export async function listLeaveEmailMessages(args: {
  after: Date;
  before?: Date;
  maxResults?: number;
}): Promise<LeaveEmailMessage[]> {
  const { gmail, mode, mailbox } = await createLeaveEmailGmailClient();
  const q = buildGmailSearchQuery({
    mode,
    mailbox,
    after: args.after,
    before: args.before,
  });

  const out: LeaveEmailMessage[] = [];
  const max = Math.min(args.maxResults ?? 40, 2000);
  let pageToken: string | undefined;

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.min(50, max - out.length),
      pageToken,
    });
    const ids = (list.data.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
    for (const id of ids) {
      if (out.length >= max) break;
      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = msg.data.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name?.toLowerCase() === "subject")?.value?.trim() || "(no subject)";
      const fromRaw = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const dateHdr = headers.find((h) => h.name?.toLowerCase() === "date")?.value;
      const { name, email } = parseFromHeader(fromRaw);
      const receivedAt = dateHdr
        ? new Date(dateHdr).toISOString()
        : new Date(Number(msg.data.internalDate || Date.now())).toISOString();
      const bodyText = extractPlainText(msg.data.payload).trim().slice(0, 12_000);
      const snippet = String(msg.data.snippet || bodyText || subject).trim().slice(0, 500);
      out.push({
        id,
        threadId: String(msg.data.threadId || id),
        receivedAt,
        fromEmail: email,
        fromName: name,
        subject: subject.slice(0, 300),
        snippet,
        bodyText: bodyText || snippet,
      });
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken && out.length < max);

  return out.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
}

/** Quick check that DWD can read People Ops mail (delegated inbox or direct mailbox). */
export async function probeLeaveEmailMailbox(): Promise<{
  ok: boolean;
  mailbox: string;
  impersonateUser: string;
  mode: LeaveEmailGmailReadMode;
  error?: string;
  recentCount: number;
}> {
  const mailbox = leaveEmailMailbox();
  try {
    const client = await createLeaveEmailGmailClient();
    const list = await client.gmail.users.messages.list({
      userId: "me",
      q: buildGmailSearchQuery({
        mode: client.mode,
        mailbox,
        after: subMonths(new Date(), 1),
      }),
      maxResults: 10,
    });
    const count = (list.data.messages ?? []).length;
    return {
      ok: true,
      mailbox,
      impersonateUser: client.impersonateUser,
      mode: client.mode,
      recentCount: count,
    };
  } catch (e) {
    return {
      ok: false,
      mailbox,
      impersonateUser: leaveEmailGmailUser() || mailbox,
      mode: leaveEmailImpersonateMailbox() ? "impersonate_mailbox" : "delegated_inbox",
      recentCount: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** List every month window from `monthsBack` ago through today (oldest month first). */
export function leaveEmailMonthWindows(monthsBack: number): { after: Date; before: Date }[] {
  const windows: { after: Date; before: Date }[] = [];
  const now = new Date();
  for (let i = monthsBack; i >= 0; i--) {
    const month = subMonths(now, i);
    windows.push({
      after: startOfMonth(month),
      before: startOfMonth(addMonths(month, 1)),
    });
  }
  return windows;
}
