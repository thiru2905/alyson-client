import { google } from "googleapis";
import { format } from "date-fns";
import { listReportActivities } from "@/lib/google-reports-activities";
import {
  auditEmailTextStats,
  computeDetailStats,
  applyDriveDocTitleHints,
  enrichChatsForUser,
  enrichGoogleDocsWithContent,
  listUserCreatedGoogleDocsFromDrive,
  mergeAuditDocsWithDriveCatalog,
  pickDocIdFromMeta,
  pickDocTitleFromRenameMeta,
  extractChatTextFromMeta,
  formatChatAuditSummary,
  humanEmailRecipient,
  inferContentCategory,
  isGoogleDocsCreateEvent,
  isOutboundSmtpDelivery,
  listUserSentGmailRich,
  mergeAndEnrichEmails,
  pickAuditMeta,
  statsFromText,
} from "@/lib/workspace-activity-content.server";
import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type {
  GmailSentSnippet,
  WorkspaceActivityItem,
  WorkspaceActivityResponse,
  WorkspaceActivityRow,
  WorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-types";

export type {
  GmailSentSnippet,
  WorkspaceActivityItem,
  WorkspaceActivityResponse,
  WorkspaceActivityRow,
  WorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-types";

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
];
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_GMAIL_SNIPPETS = 35;

const Input = z
  .object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    /** When true, count scheduled calendar events in the window (not just audit create_event). */
    accurateMeetings: z.boolean().optional(),
  })
  .optional();

const CACHE_TTL_MS = 5 * 60_000;
/** Cap audit pagination so a large org cannot hang the server for hours. */
const MAX_AUDIT_PAGES_PER_APP = 40;
const WORKSPACE_ACTIVITY_TIMEOUT_MS = 90_000;
const activityCache = new Map<string, { at: number; data: WorkspaceActivityResponse }>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Per-user Calendar API is accurate but very slow for large teams; audit is default. */
function useAccurateCalendarMeetings() {
  return process.env.WORKSPACE_ACTIVITY_ACCURATE_MEETINGS === "1";
}

function env(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function isoZ(dt: Date) {
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeEventIso(input: string | undefined, fallback: Date) {
  if (!input) return isoZ(fallback);
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return isoZ(fallback);
  return isoZ(d);
}

async function loadServiceAccountJwtForSubject(subject: string, scopes: string[]) {
  let parsed: { client_email?: string; private_key?: string } | null = null;
  const inlineJson = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    parsed = JSON.parse(inlineJson) as { client_email?: string; private_key?: string };
  } else {
    const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
    const txt = await fs.readFile(credentialsPath, "utf8");
    parsed = JSON.parse(txt) as { client_email?: string; private_key?: string };
  }

  const clientEmail = parsed.client_email || env("GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL");
  const privateKey = parsed.private_key;
  if (!privateKey) {
    throw new Error("Failed to load private_key from GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS");
  }
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject,
  });
}

async function buildDirectoryAndReportsClients() {
  const adminSubject = env("GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
  const auth = await loadServiceAccountJwtForSubject(adminSubject, SCOPES);
  return {
    directory: google.admin({ version: "directory_v1", auth }),
    reports: google.admin({ version: "reports_v1", auth }),
  };
}

async function countCalendarMeetingsForUser(email: string, startTime: string, endTime: string): Promise<number> {
  const auth = await loadServiceAccountJwtForSubject(email, [CALENDAR_SCOPE]);
  const calendar = google.calendar({ version: "v3", auth });
  let count = 0;
  let pageToken: string | undefined;
  do {
    const r = await calendar.events.list({
      calendarId: "primary",
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      pageToken,
      maxResults: 250,
      // Reduce payload size for faster list calls.
      fields: "items(status,start/date,start/dateTime),nextPageToken",
    });
    for (const e of r.data.items ?? []) {
      if (String(e?.status || "").toLowerCase() === "cancelled") continue;
      if (e?.start?.dateTime || e?.start?.date) count += 1;
    }
    pageToken = r.data.nextPageToken || undefined;
  } while (pageToken);
  return count;
}

async function listAllUsers(
  directoryService: Awaited<ReturnType<typeof buildDirectoryAndReportsClients>>["directory"],
) {
  const users: string[] = [];
  let pageToken: string | undefined;
  do {
    const resp = await directoryService.users.list({
      customer: "my_customer",
      maxResults: 500,
      orderBy: "email",
      pageToken,
    });
    for (const u of resp.data.users ?? []) {
      const email = String(u.primaryEmail || "").trim().toLowerCase();
      if (email) users.push(email);
    }
    pageToken = resp.data.nextPageToken || undefined;
  } while (pageToken);
  return users;
}

function flattenAuditParameter(entry: any, into: Record<string, string>, prefix = "") {
  const name = String(entry?.name || "").trim();
  if (!name) return;
  const key = prefix ? `${prefix}.${name}` : name;
  const raw = entry?.value ?? entry?.intValue ?? entry?.boolValue;
  if (raw != null) into[key] = String(raw);

  const nested = entry?.messageValue?.parameter ?? entry?.parameters ?? [];
  if (Array.isArray(nested)) {
    for (const child of nested) flattenAuditParameter(child, into, key);
  }

  const multi = entry?.multiValue;
  if (Array.isArray(multi)) {
    into[`${key}.multi`] = multi.map((v) => String(v)).join(" ");
  } else if (multi != null) {
    into[`${key}.multi`] = String(multi);
  }
}

function extractNestedParameterMap(event: any) {
  const data: Record<string, string> = {};
  for (const parameter of event?.parameters ?? []) {
    flattenAuditParameter(parameter, data);
  }
  return data;
}

async function countAppEvents(args: {
  reports: ReturnType<typeof google.admin>;
  applicationName: "gmail" | "calendar" | "drive" | "chat";
  eventName: string;
  startTime: string;
  endTime: string;
  includeEvent?: (event: any, metadata: Record<string, string>) => boolean;
  warnings?: string[];
}) {
  const counts = new Map<string, number>();
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const resp = await listReportActivities(args.reports, {
      userKey: "all",
      applicationName: args.applicationName,
      eventName: args.eventName,
      startTime: args.startTime,
      endTime: args.endTime,
      maxResults: 1000,
      pageToken,
    });

    for (const item of resp.data.items ?? []) {
      const activity = item as {
        actor?: { email?: string };
        events?: Array<{ name?: string; parameters?: unknown[] }>;
      };
      const actorEmail = String(activity.actor?.email || "").trim().toLowerCase();
      if (!actorEmail) continue;
      const fullMeta = mergeActivityEventsMeta(activity);
      let counted = false;
      for (const event of activity.events ?? []) {
        if (String(event.name || "") !== args.eventName) continue;
        if (args.includeEvent && !args.includeEvent(event, fullMeta)) continue;
        if (counted) continue;
        counts.set(actorEmail, (counts.get(actorEmail) ?? 0) + 1);
        counted = true;
      }
    }

    pageToken = resp.data.nextPageToken || undefined;
    pages += 1;
  } while (pageToken && pages < MAX_AUDIT_PAGES_PER_APP);

  if (pageToken) {
    args.warnings?.push(
      `${args.applicationName}/${args.eventName}: truncated after ${MAX_AUDIT_PAGES_PER_APP} API pages (counts may be low).`,
    );
  }
  return counts;
}

async function countCalendarMeetingsByUser(
  users: string[],
  startTime: string,
  endTime: string,
  warnings: string[],
) {
  const counts = new Map<string, number>();
  const concurrency = 16;
  let i = 0;

  async function worker() {
    while (i < users.length) {
      const idx = i++;
      const email = users[idx]!;
      try {
        counts.set(email, await countCalendarMeetingsForUser(email, startTime, endTime));
      } catch (e) {
        warnings.push(`calendar list(${email}): ${e instanceof Error ? e.message : String(e)}`);
        counts.set(email, 0);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, () => worker()));
  return counts;
}

export async function runGetWorkspaceActivity(
  data?: { start?: string; end?: string; accurateMeetings?: boolean },
): Promise<WorkspaceActivityResponse> {
  return withTimeout(runGetWorkspaceActivityImpl(data), WORKSPACE_ACTIVITY_TIMEOUT_MS, "Workspace activity");
}

async function runGetWorkspaceActivityImpl(
  data?: { start?: string; end?: string; accurateMeetings?: boolean },
): Promise<WorkspaceActivityResponse> {
    const now = new Date();
    const fallbackStart = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const startTime = normalizeEventIso(data?.start, fallbackStart);
    const endTime = normalizeEventIso(data?.end, now);

    if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
      throw new Error("Start time must be earlier than end time.");
    }

    const cacheKey = `${startTime}|${endTime}`;
    const cached = activityCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return {
        ...cached.data,
        warnings: [...cached.data.warnings, "served_from_cache"],
      };
    }

    const warnings: string[] = [];
    const { directory, reports } = await buildDirectoryAndReportsClients();

    const users = await listAllUsers(directory);
    const accurateMeetings = useAccurateCalendarMeetings() || data?.accurateMeetings === true;
    if (!accurateMeetings) {
      warnings.push(
        "Meetings use Workspace audit (create_event) — counts only events the user created, not attended. Enable accurateMeetings or WORKSPACE_ACTIVITY_ACCURATE_MEETINGS=1 for calendar events in window.",
      );
    } else if (!useAccurateCalendarMeetings()) {
      warnings.push("Meetings counted from each user's Google Calendar (scheduled in window, incl. attended).");
    }

    const meetingCountsPromise = accurateMeetings
      ? countCalendarMeetingsByUser(users, startTime, endTime, warnings).catch((e) => {
          warnings.push(`calendar events(list): ${e instanceof Error ? e.message : String(e)}`);
          return new Map<string, number>();
        })
      : countAppEvents({
          reports,
          applicationName: "calendar",
          eventName: "create_event",
          startTime,
          endTime,
          warnings,
        }).catch((e) => {
          warnings.push(`calendar create_event: ${e instanceof Error ? e.message : String(e)}`);
          return new Map<string, number>();
        });

    const [emailCounts, meetingCounts, docsCounts, chatCounts] = await Promise.all([
      countAppEvents({
        reports,
        applicationName: "gmail",
        eventName: "delivery",
        startTime,
        endTime,
        warnings,
        includeEvent: (_event, metadata) => isOutboundSmtpDelivery(metadata),
      }).catch((e) => {
        warnings.push(`gmail delivery: ${e instanceof Error ? e.message : String(e)}`);
        return new Map<string, number>();
      }),
      meetingCountsPromise,
      countAppEvents({
        reports,
        applicationName: "drive",
        eventName: "create",
        startTime,
        endTime,
        warnings,
        includeEvent: (_event, metadata) => isGoogleDocsCreateEvent(metadata),
      }).catch((e) => {
        warnings.push(`drive create(doc_type=document): ${e instanceof Error ? e.message : String(e)}`);
        return new Map<string, number>();
      }),
      countAppEvents({
        reports,
        applicationName: "chat",
        eventName: "message_posted",
        startTime,
        endTime,
        warnings,
      }).catch((e) => {
        warnings.push(`chat message_posted: ${e instanceof Error ? e.message : String(e)}`);
        return new Map<string, number>();
      }),
    ]);

    const rows: WorkspaceActivityRow[] = users.map((email) => ({
      userEmail: email,
      emailsSent: emailCounts.get(email) ?? 0,
      meetingsCreated: meetingCounts.get(email) ?? 0,
      docsCreated: docsCounts.get(email) ?? 0,
      chatMessagesSent: chatCounts.get(email) ?? 0,
    }));
    rows.sort((a, b) => b.emailsSent - a.emailsSent || a.userEmail.localeCompare(b.userEmail));

    const result = {
      range: { start: startTime, end: endTime },
      generatedAt: new Date().toISOString(),
      usersProcessed: rows.length,
      rows,
      warnings,
    };
    activityCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
}

const DETAIL_MAX_PER_KIND = 50;

function mergeActivityEventsMeta(item: {
  events?: Array<{ name?: string | null; parameters?: unknown[] }>;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const event of item.events ?? []) {
    const meta = extractNestedParameterMap(event);
    for (const [k, v] of Object.entries(meta)) {
      if (v?.trim()) merged[k] = v;
    }
  }
  return merged;
}

function pushItem(
  list: WorkspaceActivityItem[],
  at: string,
  kind: WorkspaceActivityItem["kind"],
  title: string,
  extra?: Partial<WorkspaceActivityItem>,
) {
  if (list.length >= DETAIL_MAX_PER_KIND) return;
  const t = title.trim() || "(untitled)";
  const preview = extra?.preview?.trim();
  const bodyChars = extra?.bodyChars ?? (preview ? preview.length : undefined);
  const bodyWords = extra?.bodyWords ?? (preview ? preview.split(/\s+/).filter(Boolean).length : undefined);
  list.push({
    at,
    kind,
    title: t.slice(0, 240),
    detail: extra?.detail?.trim().slice(0, 320),
    preview: preview?.slice(0, 2400),
    bodyChars,
    bodyWords,
    category: extra?.category,
    to: extra?.to,
    room: extra?.room,
    mimeType: extra?.mimeType,
    source: extra?.source ?? "audit",
    meta: extra?.meta,
  });
}

async function listUserAuditItems(args: {
  reports: ReturnType<typeof google.admin>;
  userEmail: string;
  applicationName: "gmail" | "drive" | "chat";
  eventName: string;
  startTime: string;
  endTime: string;
  includeEvent?: (meta: Record<string, string>) => boolean;
  onItem: (at: string, meta: Record<string, string>) => void;
  maxPages?: number;
}) {
  let pageToken: string | undefined;
  let pages = 0;
  const maxPages = args.maxPages ?? 12;
  do {
    const resp = await listReportActivities(args.reports, {
      userKey: args.userEmail,
      applicationName: args.applicationName,
      eventName: args.eventName,
      startTime: args.startTime,
      endTime: args.endTime,
      maxResults: 500,
      pageToken,
    });
    for (const item of resp.data.items ?? []) {
      const at = String(item.id?.time ?? "");
      if (!at) continue;
      const fullMeta = mergeActivityEventsMeta(item);
      let emitted = false;
      for (const event of item.events ?? []) {
        if (String(event.name || "") !== args.eventName) continue;
        if (args.includeEvent && !args.includeEvent(fullMeta)) continue;
        if (emitted) continue;
        args.onItem(at, fullMeta);
        emitted = true;
      }
    }
    pageToken = resp.data.nextPageToken || undefined;
    pages += 1;
  } while (pageToken && pages < maxPages);
}

async function listUserCalendarMeetings(
  userEmail: string,
  startTime: string,
  endTime: string,
  warnings: string[],
): Promise<WorkspaceActivityItem[]> {
  const out: WorkspaceActivityItem[] = [];
  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [CALENDAR_SCOPE]);
    const calendar = google.calendar({ version: "v3", auth });
    let pageToken: string | undefined;
    do {
      const r = await calendar.events.list({
        calendarId: "primary",
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        pageToken,
        maxResults: 250,
        fields: "items(summary,description,status,start/date,start/dateTime,htmlLink),nextPageToken",
      });
      for (const e of r.data.items ?? []) {
        if (String(e?.status || "").toLowerCase() === "cancelled") continue;
        const start = e?.start?.dateTime ?? (e?.start?.date ? `${e.start.date}T12:00:00Z` : null);
        if (!start || out.length >= DETAIL_MAX_PER_KIND) continue;
        const desc = e.description ? String(e.description) : "";
        pushItem(out, start, "meeting", String(e.summary || "Meeting"), {
          preview: desc.slice(0, 800),
          bodyChars: desc.length,
          bodyWords: desc ? desc.split(/\s+/).filter(Boolean).length : 0,
          source: "calendar",
        });
      }
      pageToken = r.data.nextPageToken || undefined;
    } while (pageToken && out.length < DETAIL_MAX_PER_KIND);
  } catch (e) {
    warnings.push(`calendar detail(${userEmail}): ${e instanceof Error ? e.message : String(e)}`);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function deriveFocusHints(args: {
  emails: WorkspaceActivityItem[];
  chats: WorkspaceActivityItem[];
  docs: WorkspaceActivityItem[];
  meetings: WorkspaceActivityItem[];
  topApps: Array<{ name: string; category: string; hours: number }>;
}): string[] {
  const hints: string[] = [];
  const { emails, chats, docs, meetings, topApps } = args;

  if (topApps.length) {
    const productive = topApps.filter((a) => a.category === "productive").slice(0, 3);
    const distracting = topApps.filter((a) => a.category === "distracting").slice(0, 2);
    if (productive.length) {
      hints.push(`Time Doctor — productive tools: ${productive.map((a) => `${a.name} (${a.hours.toFixed(1)}h)`).join(", ")}`);
    }
    if (distracting.length) {
      hints.push(`Time Doctor — distracting time: ${distracting.map((a) => a.name).join(", ")}`);
    }
  }

  const counts = [
    { label: "meetings", n: meetings.length },
    { label: "emails sent", n: emails.length },
    { label: "chat messages", n: chats.length },
    { label: "docs created", n: docs.length },
  ].sort((a, b) => b.n - a.n);
  const top = counts.filter((c) => c.n > 0)[0];
  if (top && top.n >= 3) {
    hints.push(`Workspace signal — strongest activity: ${top.label} (${top.n} in window)`);
  }

  const roomCounts = new Map<string, number>();
  for (const c of chats) {
    const room = c.detail || c.title;
    if (!room) continue;
    roomCounts.set(room, (roomCounts.get(room) ?? 0) + 1);
  }
  const topRoom = [...roomCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRoom && topRoom[1] >= 2) {
    hints.push(`Chat focus — most active in: ${topRoom[0]} (${topRoom[1]} messages)`);
  }

  return hints.slice(0, 6);
}

const DetailInput = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function fetchWorkspaceUserActivityDetailImpl(data: {
  userEmail: string;
  start: string;
  end: string;
}): Promise<WorkspaceUserActivityDetail> {
  const startTime = normalizeEventIso(data.start, new Date(data.start));
  const endTime = normalizeEventIso(data.end, new Date(data.end));
  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
    throw new Error("Start time must be earlier than end time.");
  }

  const userEmail = data.userEmail.trim().toLowerCase();
  const warnings: string[] = [];
  const emails: WorkspaceActivityItem[] = [];
  const chats: WorkspaceActivityItem[] = [];
  const docs: WorkspaceActivityItem[] = [];

  const { reports } = await buildDirectoryAndReportsClients();

  await Promise.all([
    listUserAuditItems({
      reports,
      userEmail,
      applicationName: "gmail",
      eventName: "delivery",
      startTime,
      endTime,
      includeEvent: (meta) => isOutboundSmtpDelivery(meta),
      onItem: (at, meta) => {
        const subject = pickAuditMeta(meta, ["subject", "subject_line", "message_subject", "email_subject"]);
        const stats = auditEmailTextStats(meta, subject || "Outbound email");
        const to = humanEmailRecipient(meta);
        pushItem(emails, at, "email", subject || "Outbound email", {
          to,
          preview: stats.preview,
          bodyChars: stats.bodyChars,
          bodyWords: stats.bodyWords,
          category: inferContentCategory(subject, stats.preview),
          source: "audit",
          meta,
        });
      },
    }).catch((e) => {
      warnings.push(`gmail detail: ${e instanceof Error ? e.message : String(e)}`);
    }),
    listUserAuditItems({
      reports,
      userEmail,
      applicationName: "drive",
      eventName: "create",
      startTime,
      endTime,
      includeEvent: (meta) => isGoogleDocsCreateEvent(meta),
      onItem: (at, meta) => {
        const title = pickAuditMeta(meta, ["doc_title", "title", "document_title", "file_name"]);
        const docType = pickAuditMeta(meta, ["doc_type", "docType", "mime_type", "mimeType"]);
        const docId = pickDocIdFromMeta(meta);
        const resolvedTitle = title || "Google Doc created";
        pushItem(docs, at, "doc", resolvedTitle, {
          detail: [docType, docId ? `doc_id: ${docId}` : ""].filter(Boolean).join(" · ") || undefined,
          mimeType: docType,
          preview: undefined,
          bodyChars: 0,
          bodyWords: 0,
          category: inferContentCategory(resolvedTitle, ""),
          meta: docId ? { ...meta, doc_id: docId } : meta,
          source: "audit",
        });
      },
    }).catch((e) => {
      warnings.push(`drive detail: ${e instanceof Error ? e.message : String(e)}`);
    }),
    listUserAuditItems({
      reports,
      userEmail,
      applicationName: "chat",
      eventName: "message_posted",
      startTime,
      endTime,
      onItem: (at, meta) => {
        const room = pickAuditMeta(meta, ["room_name", "space_name", "target", "conversation_id"]);
        const chatStats = extractChatTextFromMeta(meta, formatChatAuditSummary(meta));
        const label = chatStats.preview.slice(0, 120) || formatChatAuditSummary(meta) || "Chat message";
        pushItem(chats, at, "chat", label, {
          room,
          detail: room ? `Room: ${room}` : undefined,
          preview: chatStats.preview,
          bodyChars: chatStats.bodyChars,
          bodyWords: chatStats.bodyWords,
          category: inferContentCategory(room || label, chatStats.preview),
          source: "audit",
          meta,
        });
      },
    }).catch((e) => {
      warnings.push(`chat detail: ${e instanceof Error ? e.message : String(e)}`);
    }),
  ]);

  const meetings = await listUserCalendarMeetings(userEmail, startTime, endTime, warnings);

  const renameTitles = new Map<string, string>();
  await listUserAuditItems({
    reports,
    userEmail,
    applicationName: "drive",
    eventName: "rename",
    startTime,
    endTime,
    onItem: (_at, meta) => {
      const docId = pickDocIdFromMeta(meta);
      const title = pickDocTitleFromRenameMeta(meta);
      if (docId && title) renameTitles.set(docId, title);
    },
  }).catch((e) => {
    warnings.push(`drive rename: ${e instanceof Error ? e.message : String(e)}`);
  });

  let docsPrepared = applyDriveDocTitleHints(docs, renameTitles);
  const driveCatalog = await listUserCreatedGoogleDocsFromDrive(userEmail, startTime, endTime);
  if (driveCatalog.warning) warnings.push(driveCatalog.warning);
  docsPrepared = mergeAuditDocsWithDriveCatalog(docsPrepared, driveCatalog.byId);

  const gmailR = await listUserSentGmailRich(userEmail, startTime, endTime);
  const emailMerge = await mergeAndEnrichEmails(userEmail, emails, gmailR.items, gmailR.warning);
  warnings.push(...emailMerge.warnings);
  let finalEmails = emailMerge.emails;
  const gmailEnriched = emailMerge.gmailEnriched;

  const docsR = await enrichGoogleDocsWithContent(userEmail, docsPrepared);
  if (docsR.warning) warnings.push(docsR.warning);
  let finalDocs = docsR.docs;
  const docsEnriched = finalDocs.some(
    (d) => d.source === "drive" && ((d.bodyWords ?? 0) > 2 || !(d.title || "").toLowerCase().includes("untitled")),
  );

  const chatMerge = await enrichChatsForUser(userEmail, startTime, endTime, chats);
  warnings.push(...chatMerge.warnings);
  const finalChats = chatMerge.chats;
  const chatEnriched = chatMerge.chatEnriched;

  const sortDesc = (a: WorkspaceActivityItem, b: WorkspaceActivityItem) => b.at.localeCompare(a.at);
  finalEmails.sort(sortDesc);
  finalDocs.sort(sortDesc);

  const emailSlice = finalEmails.slice(0, DETAIL_MAX_PER_KIND);
  const chatSlice = finalChats.slice(0, DETAIL_MAX_PER_KIND);
  const docSlice = finalDocs.slice(0, DETAIL_MAX_PER_KIND);

  const stats = computeDetailStats({
    emails: emailSlice,
    chats: chatSlice,
    docs: docSlice,
    meetings,
  });

  return {
    userEmail,
    range: { start: startTime, end: endTime },
    generatedAt: new Date().toISOString(),
    emails: emailSlice,
    chats: chatSlice,
    docs: docSlice,
    meetings,
    focusHints: deriveFocusHints({ emails: emailSlice, chats: chatSlice, docs: docSlice, meetings, topApps: [] }),
    warnings,
    gmailEnriched,
    docsEnriched,
    chatEnriched,
    stats,
  };
}

/** Per-user Workspace audit detail (subjects, doc titles, chat rooms — not full message bodies). */
export async function runGetWorkspaceUserActivityDetail(
  data: z.infer<typeof DetailInput>,
): Promise<WorkspaceUserActivityDetail> {
  return withTimeout(
    fetchWorkspaceUserActivityDetailImpl(data),
    WORKSPACE_ACTIVITY_TIMEOUT_MS,
    "Workspace employee detail",
  );
}

/** Sent mail subjects + snippets (requires Gmail readonly domain-wide delegation for the user). */
export async function listUserSentGmailSnippets(
  userEmail: string,
  startTime: string,
  endTime: string,
): Promise<{ items: GmailSentSnippet[]; warning?: string }> {
  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [GMAIL_READONLY_SCOPE]);
    const gmail = google.gmail({ version: "v1", auth });
    const after = format(new Date(startTime), "yyyy/MM/dd");
    const before = format(new Date(endTime), "yyyy/MM/dd");
    const q = `after:${after} before:${before} in:sent`;

    const items: GmailSentSnippet[] = [];
    let pageToken: string | undefined;

    do {
      const list = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 50,
        pageToken,
      });
      const ids = (list.data.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
      for (const id of ids) {
        if (items.length >= MAX_GMAIL_SNIPPETS) break;
        const msg = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "To", "Date"],
        });
        const headers = msg.data.payload?.headers ?? [];
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value?.trim() || "(no subject)";
        const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value?.trim();
        const dateHdr = headers.find((h) => h.name?.toLowerCase() === "date")?.value;
        const at = dateHdr
          ? new Date(dateHdr).toISOString()
          : new Date(Number(msg.data.internalDate || Date.now())).toISOString();
        const snippet = String(msg.data.snippet || "").trim().slice(0, 400);
        items.push({
          at,
          subject: subject.slice(0, 200),
          snippet: snippet || subject,
          to: to?.slice(0, 120),
        });
      }
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken && items.length < MAX_GMAIL_SNIPPETS);

    return { items };
  } catch (e) {
    return {
      items: [],
      warning: `Gmail read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
