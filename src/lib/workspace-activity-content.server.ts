import { google } from "googleapis";
import { format } from "date-fns";
import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";
import type { Readable } from "node:stream";
import type { GmailSentSnippet, WorkspaceActivityItem } from "@/lib/workspace-activity-types";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOCS_READONLY_SCOPE = "https://www.googleapis.com/auth/documents.readonly";
const CHAT_MESSAGES_READONLY = "https://www.googleapis.com/auth/chat.messages.readonly";
const CHAT_SPACES_READONLY = "https://www.googleapis.com/auth/chat.spaces.readonly";
const MAX_GMAIL_RICH = 50;
const MAX_DOC_RICH = 30;
const MAX_GMAIL_BY_ID = 25;
const MAX_CHAT_SPACES = 40;
const MAX_CHAT_MSG_PER_SPACE = 80;
const MAX_CHAT_TOTAL = 120;
const MAX_PREVIEW = 2400;
/** Stats cap — MIME sizeEstimate / audit bytes can be MB with attachments. */
const MAX_EMAIL_BODY_CHARS = 24_000;

const ROUTING_META_KEYS = new Set([
  "flattened_destinations",
  "destination",
  "recipient",
  "message_id",
  "rfc822_msgid",
  "doc_id",
  "docid",
  "file_id",
  "id",
  "document_id",
  "doc_type",
  "doctype",
  "mime_type",
  "mimetype",
  "event_type",
  "type",
]);

function env(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const DIRECTORY_USER_READONLY = "https://www.googleapis.com/auth/admin.directory.user.readonly";

async function workspaceUserIdForChat(userEmail: string): Promise<string | undefined> {
  const adminSubject = process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim();
  if (!adminSubject) return undefined;
  try {
    const auth = await loadServiceAccountJwtForSubject(adminSubject, [DIRECTORY_USER_READONLY]);
    const directory = google.admin({ version: "directory_v1", auth });
    const u = await directory.users.get({ userKey: userEmail });
    return u.data.id ? String(u.data.id) : undefined;
  } catch {
    return undefined;
  }
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

export function countWords(text: string) {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function statsFromText(text: string) {
  const preview = text.trim().slice(0, MAX_PREVIEW);
  return {
    preview,
    bodyChars: preview.length,
    bodyWords: countWords(preview),
  };
}

function capEmailBodyForStats(text: string) {
  const t = text.trim();
  if (!t) return "";
  return t.length <= MAX_EMAIL_BODY_CHARS ? t : t.slice(0, MAX_EMAIL_BODY_CHARS);
}

/** Char/word counts from visible plain text only (not MIME size or audit byte fields). */
export function emailBodyStatsFromPlain(plain: string, subject = "") {
  const capped = capEmailBodyForStats(plain || subject);
  return statsFromText(capped);
}

const AUDIT_META_PREFIXES = ["", "event_info.", "message_info.", "primary_event.", "doc_info.", "resource_details."];

/** Resolve audit fields after deep flattening (e.g. event_info.doc_id). */
export function pickAuditMeta(meta: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    for (const prefix of AUDIT_META_PREFIXES) {
      const v = meta[`${prefix}${key}`]?.trim();
      if (v) return v;
    }
    const bare = key.toLowerCase();
    for (const [k, v] of Object.entries(meta)) {
      if (!v?.trim()) continue;
      const lk = k.toLowerCase();
      if (lk === bare || lk.endsWith(`.${bare}`)) return v.trim();
    }
  }
  return "";
}

function pickMeta(meta: Record<string, string>, keys: string[]) {
  return pickAuditMeta(meta, keys);
}

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{12,}$/;

export function pickDocIdFromMeta(meta: Record<string, string>): string | null {
  const direct = pickAuditMeta(meta, ["doc_id", "docId", "file_id", "document_id"]);
  if (direct && DRIVE_ID_RE.test(direct)) return direct;
  for (const [k, v] of Object.entries(meta)) {
    if (!v?.trim() || !DRIVE_ID_RE.test(v.trim())) continue;
    const lk = k.toLowerCase();
    if (lk.includes("doc_id") || lk.includes("file_id") || lk.includes("document_id")) return v.trim();
  }
  return null;
}

const PLACEHOLDER_DOC_TITLES = new Set(["untitled document", "google doc created", "untitled spreadsheet", "untitled presentation"]);

export function isPlaceholderDocTitle(title: string) {
  return PLACEHOLDER_DOC_TITLES.has(title.trim().toLowerCase());
}

/** Drive `rename` audit uses new_value for the title after rename. */
export function pickDocTitleFromRenameMeta(meta: Record<string, string>): string {
  return pickAuditMeta(meta, ["new_value", "doc_title", "title", "document_title", "file_name"]);
}

export function applyDriveDocTitleHints(
  docs: WorkspaceActivityItem[],
  titleByDocId: Map<string, string>,
): WorkspaceActivityItem[] {
  return docs.map((d) => {
    const docId = pickDocIdFromItem(d);
    if (!docId || !isPlaceholderDocTitle(d.title)) return d;
    const hint = titleByDocId.get(docId)?.trim();
    if (!hint || isPlaceholderDocTitle(hint)) return d;
    return ensureActivityItemStats({
      ...d,
      title: hint,
      preview: d.preview,
      bodyChars: d.bodyChars ?? 0,
      bodyWords: d.bodyWords ?? 0,
      meta: { ...d.meta, doc_id: docId },
    });
  });
}

export async function listUserCreatedGoogleDocsFromDrive(
  userEmail: string,
  startTime: string,
  endTime: string,
): Promise<{ byId: Map<string, { name: string; at: string }>; warning?: string }> {
  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [DRIVE_READONLY_SCOPE]);
    const drive = google.drive({ version: "v3", auth });
    const q = [
      "mimeType='application/vnd.google-apps.document'",
      "trashed=false",
      `createdTime >= '${new Date(startTime).toISOString()}'`,
      `createdTime <= '${new Date(endTime).toISOString()}'`,
    ].join(" and ");
    const byId = new Map<string, { name: string; at: string }>();
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q,
        fields: "nextPageToken,files(id,name,createdTime)",
        orderBy: "createdTime desc",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        byId.set(String(f.id), {
          name: String(f.name).trim(),
          at: f.createdTime || startTime,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && byId.size < 80);
    return { byId };
  } catch (e) {
    return {
      byId: new Map(),
      warning: `Drive list docs: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Attach doc_id + real names from Drive when audit only has "Untitled document". */
export function mergeAuditDocsWithDriveCatalog(
  auditDocs: WorkspaceActivityItem[],
  driveById: Map<string, { name: string; at: string }>,
): WorkspaceActivityItem[] {
  const usedDriveIds = new Set<string>();
  const merged = auditDocs.map((d) => {
    const docId = pickDocIdFromItem(d);
    if (!docId) return d;
    const hit = driveById.get(docId);
    if (!hit) return d;
    usedDriveIds.add(docId);
    const title = isPlaceholderDocTitle(d.title) ? hit.name : d.title;
    return ensureActivityItemStats({
      ...d,
      title,
      preview: d.preview && !isPlaceholderDocTitle(d.preview ?? "") ? d.preview : undefined,
      bodyChars: 0,
      bodyWords: 0,
      meta: { ...d.meta, doc_id: docId },
      detail: d.detail || `doc_id: ${docId}`,
    });
  });

  for (const [id, hit] of driveById) {
    if (usedDriveIds.has(id)) continue;
    merged.push(
      ensureActivityItemStats({
        at: hit.at,
        kind: "doc",
        title: hit.name,
        preview: undefined,
        bodyChars: 0,
        bodyWords: 0,
        category: inferContentCategory(hit.name, ""),
        source: "audit",
        meta: { doc_id: id },
        detail: `doc_id: ${id}`,
      }),
    );
  }

  return merged.sort((a, b) => b.at.localeCompare(a.at));
}

export function isGoogleDocsCreateEvent(meta: Record<string, string>): boolean {
  const docType = pickAuditMeta(meta, ["doc_type", "docType", "item_type", "itemType"]).toLowerCase();
  const mimeType = pickAuditMeta(meta, ["mime_type", "mimeType"]).toLowerCase();
  return (
    docType.includes("document") ||
    docType.includes("docs") ||
    mimeType.includes("application/vnd.google-apps.document")
  );
}

function normSubject(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
}

function minuteKey(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toISOString().slice(0, 16);
}

/** Gmail audit text for list/detail — subject + snippet only (no MIME bytes or random meta). */
export function auditEmailTextStats(meta: Record<string, string>, title = "") {
  const subject =
    pickAuditMeta(meta, ["subject", "subject_line", "message_subject", "email_subject"]) || title;
  const snippet = pickAuditMeta(meta, [
    "message_snippet",
    "snippet",
    "payload_snippet",
    "event_info.message_snippet",
    "message_info.snippet",
  ]);
  return emailBodyStatsFromPlain(snippet, subject || "Outbound email");
}

/** Pull human-readable text from Workspace audit parameters (docs/chat/generic). */
export function auditMetaTextStats(meta: Record<string, string>, title = "") {
  const subject =
    pickAuditMeta(meta, ["subject", "subject_line", "message_subject", "email_subject", "doc_title", "title"]) ||
    title;
  const snippet = pickAuditMeta(meta, [
    "message_snippet",
    "snippet",
    "body",
    "message_body",
    "description",
    "payload_snippet",
    "text",
    "message",
    "message_text",
    "content",
    "message_content",
  ]);
  return emailBodyStatsFromPlain([subject, snippet].filter(Boolean).join("\n"), subject);
}

/** Gmail audit nests delivery fields under event_info; flat keys broke after deep parameter flattening. */
export function isOutboundSmtpDelivery(meta: Record<string, string>): boolean {
  const direct = pickMeta(meta, [
    "flattened_destinations",
    "event_info.flattened_destinations",
    "message_info.flattened_destinations",
  ]);
  if (direct.toLowerCase().includes("smtp-outbound")) return true;
  for (const [k, v] of Object.entries(meta)) {
    if (!v?.trim()) continue;
    const key = k.toLowerCase();
    if (key.includes("flattened_destinations") && v.toLowerCase().includes("smtp-outbound")) return true;
  }
  return false;
}

/** Google Chat audit enums — not user-written message body (see Admin Reports Chat appendix). */
const CHAT_AUDIT_META_KEYS = new Set([
  "dlp_scan_status",
  "msg_type",
  "attachment_status",
  "retention_state",
  "conversation_type",
  "conversation_ownership",
  "external_room",
  "actor_type",
  "primary_event",
  "is_encrypted",
  "encryption_state",
  "intersecting_policy_actions",
]);

const CHAT_AUDIT_FLAG_VALUES = new Set([
  "DLP_NOT_APPLICABLE",
  "DLP_PARTIALLY_SCANNED",
  "DLP_SCAN_FAILED",
  "DLP_SCANNED",
  "DLP_SCANNED_AND_WARNED",
  "REGULAR_MESSAGE",
  "VIDEO_MESSAGE",
  "VOICE_MESSAGE",
  "HUDDLE",
  "NO_ATTACHMENT",
  "HAS_ATTACHMENT",
  "PERMANENT",
  "EPHEMERAL_ONE_DAY",
  "EPHEMERAL_THREE_DAYS",
  "ENABLED",
  "DISABLED",
  "INTERNALLY_OWNED",
  "EXTERNALLY_OWNED",
  "SPACE",
  "USER_TO_USER_DIRECT_MESSAGE",
  "GROUP_DIRECT_MESSAGE",
  "TRUE",
  "FALSE",
]);

function isChatAuditFlagValue(value: string) {
  const v = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (CHAT_AUDIT_FLAG_VALUES.has(v)) return true;
  return /^(DLP_|EPHEMERAL_|PERMANENT|REGULAR_MESSAGE|NO_ATTACHMENT|HAS_ATTACHMENT)/.test(v);
}

function isChatAuditMetaKey(key: string) {
  const bare = key.split(".").pop()?.toLowerCase() || key.toLowerCase();
  return CHAT_AUDIT_META_KEYS.has(bare);
}

/** Human label when audit has no message body (only flags like DLP / retention / msg_type). */
export function formatChatAuditSummary(meta: Record<string, string>): string {
  const room = pickAuditMeta(meta, ["room_name", "space_name", "target", "conversation_id"]);
  const msgType = pickAuditMeta(meta, ["msg_type"]);
  const attachment = pickAuditMeta(meta, ["attachment_status"]);
  const retention = pickAuditMeta(meta, ["retention_state"]);
  const typeLabel = msgType
    ? msgType.replace(/_/g, " ").toLowerCase()
    : "message";
  const bits: string[] = [];
  if (room) bits.push(`Posted in ${room}`);
  else bits.push(`Chat ${typeLabel}`);
  if (attachment === "HAS_ATTACHMENT") bits.push("with attachment");
  if (retention && retention !== "PERMANENT") {
    bits.push(`(${retention.replace(/_/g, " ").toLowerCase()})`);
  }
  return bits.join(" · ");
}

export function humanEmailRecipient(meta: Record<string, string>) {
  const raw = pickMeta(meta, [
    "email_destination",
    "destination_address",
    "recipient_address",
    "recipient_email",
    "to",
  ]);
  if (raw && !raw.toLowerCase().includes("smtp-outbound")) return raw.slice(0, 160);
  return undefined;
}

export function extractChatTextFromMeta(meta: Record<string, string>, title = "") {
  const direct = pickAuditMeta(meta, [
    "message",
    "message_text",
    "snippet",
    "text",
    "content",
    "message_content",
    "chat_message",
    "body",
  ]);
  if (direct && !isChatAuditFlagValue(direct)) return statsFromText(direct);

  const fromValues = Object.entries(meta)
    .filter(([k, v]) => {
      if (!v?.trim() || isChatAuditFlagValue(v)) return false;
      const key = k.toLowerCase();
      if (ROUTING_META_KEYS.has(key) || isChatAuditMetaKey(key)) return false;
      if (key.includes("room_id") || key.endsWith(".id") || key === "message_id") return false;
      if (
        (key.includes("room") || key.includes("space") || key.includes("conversation")) &&
        !key.includes("message") &&
        !key.includes("text") &&
        !key.includes("content")
      ) {
        return false;
      }
      if (/^(target|member|user_id|actor|profile)/.test(key)) return false;
      return v.length >= 3 && v.length <= 8000;
    })
    .map(([, v]) => v.trim());
  const unique = [...new Set(fromValues.filter(Boolean))];
  const combined = unique.join(" ").trim();
  const text = combined || formatChatAuditSummary(meta) || title || "Chat message";
  return statsFromText(text);
}

function chatMessagePlainText(msg: {
  text?: string | null;
  formattedText?: string | null;
  argumentText?: string | null;
}) {
  const raw = String(msg.text || msg.formattedText || msg.argumentText || "").trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return raw;
}

function chatSpaceLabel(space: { displayName?: string | null; name?: string | null }) {
  return String(space.displayName || space.name || "Chat space").slice(0, 160);
}

/** Fetch sent Chat messages via Chat API (requires chat.messages.readonly domain-wide delegation). */
export async function listUserChatMessagesRich(
  userEmail: string,
  startTime: string,
  endTime: string,
): Promise<{ items: WorkspaceActivityItem[]; warning?: string }> {
  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [CHAT_MESSAGES_READONLY, CHAT_SPACES_READONLY]);
    const chat = google.chat({ version: "v1", auth });

    const userId = await workspaceUserIdForChat(userEmail);
    const mySenderName = userId ? `users/${userId}` : undefined;
    if (!mySenderName) {
      return {
        items: [],
        warning: "Chat API: could not resolve Workspace user id (admin directory delegation).",
      };
    }

    const start = new Date(startTime).toISOString();
    const end = new Date(endTime).toISOString();
    const timeFilter = `createTime > "${start}" AND createTime < "${end}"`;

    const items: WorkspaceActivityItem[] = [];
    let spacePage: string | undefined;
    let spacesScanned = 0;

    do {
      const spaceResp = await chat.spaces.list({
        pageSize: 100,
        pageToken: spacePage,
      });
      const spaces = spaceResp.data.spaces ?? [];

      for (const space of spaces) {
        if (items.length >= MAX_CHAT_TOTAL || spacesScanned >= MAX_CHAT_SPACES) break;
        spacesScanned += 1;
        const parent = space.name;
        if (!parent) continue;
        const room = chatSpaceLabel(space);
        let msgPage: string | undefined;
        let msgsInSpace = 0;

        do {
          const list = await chat.spaces.messages.list({
            parent,
            filter: timeFilter,
            pageSize: 100,
            pageToken: msgPage,
          });
          for (const msg of list.data.messages ?? []) {
            if (items.length >= MAX_CHAT_TOTAL || msgsInSpace >= MAX_CHAT_MSG_PER_SPACE) break;
            if (mySenderName && msg.sender?.name && msg.sender.name !== mySenderName) continue;
            const plain = chatMessagePlainText(msg);
            if (!plain) continue;
            msgsInSpace += 1;
            const stats = statsFromText(plain);
            const at = msg.createTime || new Date().toISOString();
            items.push(
              ensureActivityItemStats({
                at,
                kind: "chat",
                title: plain.slice(0, 120),
                preview: stats.preview,
                bodyChars: stats.bodyChars,
                bodyWords: stats.bodyWords,
                room,
                category: inferContentCategory(room, plain),
                source: "chat",
                meta: { space: parent, message: String(msg.name || "") },
              }),
            );
          }
          msgPage = list.data.nextPageToken ?? undefined;
        } while (msgPage && items.length < MAX_CHAT_TOTAL);
      }

      spacePage = spaceResp.data.nextPageToken ?? undefined;
    } while (spacePage && items.length < MAX_CHAT_TOTAL);

    return { items };
  } catch (e) {
    return {
      items: [],
      warning: `Chat API read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Prefer Chat API text; fall back to audit metadata estimates. */
export function mergeAndEnrichChats(
  auditChats: WorkspaceActivityItem[],
  apiChats: WorkspaceActivityItem[],
  apiWarning?: string,
): { chats: WorkspaceActivityItem[]; chatEnriched: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (apiWarning) warnings.push(apiWarning);

  if (apiChats.length) {
    const merged = apiChats.map((c) => ensureActivityItemStats(c)).sort((a, b) => b.at.localeCompare(a.at));
    if (auditChats.length > merged.length) {
      warnings.push(
        `Chat: showing ${merged.length} messages with full text from Chat API (${auditChats.length} audit events in window).`,
      );
    }
    return { chats: merged.slice(0, 50), chatEnriched: true, warnings };
  }

  const fallback = auditChats.map((c) => {
    const stats = extractChatTextFromMeta(c.meta ?? {}, c.title);
    return ensureActivityItemStats({
      ...c,
      preview: c.preview || stats.preview,
      bodyChars: c.bodyChars ?? stats.bodyChars,
      bodyWords: c.bodyWords ?? stats.bodyWords,
      room: c.room ?? pickMeta(c.meta ?? {}, ["room_name", "space_name", "target", "space_display_name"]),
    });
  });

  if (auditChats.length && !apiChats.length) {
    warnings.push(
      "Chat: audit logs do not include message body. Add domain-wide delegation scope https://www.googleapis.com/auth/chat.messages.readonly for char/word counts.",
    );
  }

  return { chats: fallback, chatEnriched: false, warnings };
}

/** Doc rows: counts must reflect document body, never the title string. */
function ensureDocActivityItemStats(item: WorkspaceActivityItem): WorkspaceActivityItem {
  const preview = item.preview?.trim() || "";
  return {
    ...item,
    preview: preview.slice(0, MAX_PREVIEW) || undefined,
    bodyChars: item.bodyChars ?? 0,
    bodyWords: item.bodyWords ?? 0,
  };
}

export function ensureActivityItemStats(item: WorkspaceActivityItem): WorkspaceActivityItem {
  if (item.kind === "doc") return ensureDocActivityItemStats(item);

  const preview =
    item.preview?.trim() ||
    (item.title && !item.detail?.startsWith("To:") ? item.title : "") ||
    item.detail?.trim() ||
    "";
  const bodyChars = item.bodyChars ?? (preview ? preview.length : 0);
  const bodyWords = item.bodyWords ?? countWords(preview);
  return {
    ...item,
    preview: preview.slice(0, MAX_PREVIEW) || undefined,
    bodyChars,
    bodyWords,
  };
}

export function inferContentCategory(subject: string, body: string): string {
  const blob = `${subject} ${body}`.toLowerCase();
  if (/\b(calendar|invite|meeting|standup|sync|zoom|teams)\b/.test(blob)) return "meeting";
  if (/\b(invoice|payment|billing|quote|po\b|purchase)\b/.test(blob)) return "billing";
  if (/\b(support|ticket|bug|issue|helpdesk|escalat)\b/.test(blob)) return "support";
  if (/\b(sales|proposal|deal|client|customer|rfp)\b/.test(blob)) return "sales";
  if (/\b(hr|payroll|leave|policy|onboard|offer letter)\b/.test(blob)) return "people";
  if (/\b(report|dashboard|metric|analytics|kpi)\b/.test(blob)) return "reporting";
  return "general";
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtmlToPlain(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractPlainFromGmailPart(
  part: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] } | null | undefined,
): string {
  if (!part) return "";
  const mime = String(part.mimeType || "").toLowerCase();

  if (mime.startsWith("multipart/")) {
    let plain = "";
    let html = "";
    for (const child of part.parts ?? []) {
      const childPart = child as typeof part;
      const childMime = String(childPart.mimeType || "").toLowerCase();
      const nested = extractPlainFromGmailPart(childPart);
      if (!nested) continue;
      if (childMime === "text/plain") plain = nested;
      else if (childMime === "text/html") html = nested;
      else if (!plain && !html) plain = nested;
    }
    return plain || capEmailBodyForStats(html);
  }

  if ((mime === "text/plain" || mime === "text/html") && part.body?.data) {
    const raw = decodeBase64Url(part.body.data);
    if (mime === "text/html") return capEmailBodyForStats(stripHtmlToPlain(raw));
    return capEmailBodyForStats(raw);
  }

  for (const child of part.parts ?? []) {
    const nested = extractPlainFromGmailPart(child as typeof part);
    if (nested) return nested;
  }
  return "";
}

function gmailReadableBody(
  payload: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] } | null | undefined,
  snippet?: string | null,
  subject?: string,
) {
  const plain = extractPlainFromGmailPart(payload);
  if (plain) return plain;
  return capEmailBodyForStats(String(snippet || subject || "").trim());
}

function collectDocTextRuns(node: unknown, parts: string[]) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectDocTextRuns(entry, parts);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const textRun = obj.textRun;
  if (textRun && typeof textRun === "object") {
    const content = (textRun as { content?: string | null }).content;
    if (content) parts.push(String(content));
  }
  for (const value of Object.values(obj)) collectDocTextRuns(value, parts);
}

function plainTextFromGoogleDoc(doc: unknown): string {
  const parts: string[] = [];
  collectDocTextRuns(doc, parts);
  return parts.join("").replace(/\s+/g, " ").trim();
}

function bytesToUtf8(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return new TextDecoder("utf-8").decode(raw);
  if (ArrayBuffer.isView(raw)) return new TextDecoder("utf-8").decode(raw);
  return "";
}

async function readableToUtf8(stream: Readable): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === "string") chunks.push(new TextEncoder().encode(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(chunk);
    else if (Buffer.isBuffer(chunk)) chunks.push(new Uint8Array(chunk));
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

async function exportGoogleDocAsMime(
  drive: ReturnType<typeof google.drive>,
  docId: string,
  mimeType: string,
): Promise<string> {
  try {
    const res = await drive.files.export(
      { fileId: docId, mimeType },
      { responseType: "arraybuffer" },
    );
    const text = bytesToUtf8(res.data).replace(/\r\n/g, "\n").trim();
    if (text) return text;
  } catch {
    /* try stream */
  }

  const res = await drive.files.export({ fileId: docId, mimeType }, { responseType: "stream" });
  return (await readableToUtf8(res.data as Readable)).replace(/\r\n/g, "\n").trim();
}

async function exportGoogleDocPlainText(
  drive: ReturnType<typeof google.drive>,
  docId: string,
): Promise<{ text: string; error?: string }> {
  const errors: string[] = [];
  for (const mime of ["text/plain", "text/html"] as const) {
    try {
      const raw = await exportGoogleDocAsMime(drive, docId, mime);
      const text = mime === "text/html" ? stripHtmlToPlain(raw) : raw;
      if (text.trim()) return { text: text.trim() };
    } catch (e) {
      errors.push(`${mime}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { text: "", error: errors[0] || "export returned empty" };
}

function docBodyLooksLikeTitleOnly(plain: string, title: string) {
  const p = plain.trim();
  const t = title.trim();
  if (!p) return true;
  if (!t) return false;
  if (p.length > t.length + 40) return false;
  if (countWords(p) > countWords(t) + 6) return false;
  return p.toLowerCase() === t.toLowerCase();
}

/** Char/word counts from document body text only (never the file name). */
export function docContentStats(plain: string, title: string) {
  const body = plain.trim();
  const content = body && !docBodyLooksLikeTitleOnly(body, title) ? body : "";
  const preview = content
    ? content.slice(0, MAX_PREVIEW)
    : title
      ? `${title} — body text not available (check Docs/Drive delegation)`
      : "";
  return {
    preview,
    bodyChars: content.length,
    bodyWords: content ? countWords(content) : 0,
  };
}

async function fetchGoogleDocBodyPlain(
  drive: ReturnType<typeof google.drive>,
  docsApi: ReturnType<typeof google.docs>,
  docId: string,
): Promise<{ plain: string; apiTitle?: string; error?: string }> {
  let plain = "";
  let apiTitle = "";
  const errors: string[] = [];

  const exported = await exportGoogleDocPlainText(drive, docId);
  plain = exported.text;
  if (exported.error && !plain) errors.push(exported.error);

  try {
    const doc = await docsApi.documents.get({ documentId: docId });
    apiTitle = String(doc.data.title || "").trim();
    const structured = plainTextFromGoogleDoc(doc.data);
    if (structured.length > plain.length) plain = structured;
  } catch (e) {
    errors.push(`docs.get: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    plain: plain.trim(),
    apiTitle: apiTitle || undefined,
    error: plain ? undefined : errors.join(" · ") || undefined,
  };
}

/** Sent mail with body length + preview (Gmail readonly + domain-wide delegation). */
export async function listUserSentGmailRich(
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
        if (items.length >= MAX_GMAIL_RICH) break;
        const msg = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });
        const headers = msg.data.payload?.headers ?? [];
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value?.trim() || "(no subject)";
        const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value?.trim();
        const dateHdr = headers.find((h) => h.name?.toLowerCase() === "date")?.value;
        const at = dateHdr
          ? new Date(dateHdr).toISOString()
          : new Date(Number(msg.data.internalDate || Date.now())).toISOString();
        const plain = gmailReadableBody(msg.data.payload, msg.data.snippet, subject);
        const stats = emailBodyStatsFromPlain(plain, subject);
        const preview = stats.preview;
        const bodyChars = stats.bodyChars;
        const bodyWords = stats.bodyWords;
        const category = inferContentCategory(subject, plain || subject);
        items.push({
          at,
          subject: subject.slice(0, 240),
          snippet: preview.slice(0, 400) || subject,
          preview,
          to: to?.slice(0, 160),
          bodyChars,
          bodyWords,
          category,
          meta: { gmail_id: String(id) },
        });
      }
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken && items.length < MAX_GMAIL_RICH);

    return { items };
  } catch (e) {
    return {
      items: [],
      warning: `Gmail read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function gmailSnippetsToActivityItems(snippets: GmailSentSnippet[]): WorkspaceActivityItem[] {
  return snippets.map((g) =>
    ensureActivityItemStats({
      at: g.at,
      kind: "email" as const,
      title: g.subject,
      detail: g.to ? `To: ${g.to}` : undefined,
      preview: g.preview ?? g.snippet,
      bodyChars: g.bodyChars,
      bodyWords: g.bodyWords,
      category: g.category,
      to: g.to,
      source: "gmail" as const,
      meta: g.meta,
    }),
  );
}

async function fetchGmailMessageStats(
  userEmail: string,
  messageId: string,
): Promise<{ preview: string; bodyChars: number; bodyWords: number; to?: string; subject: string } | null> {
  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [GMAIL_READONLY_SCOPE]);
    const gmail = google.gmail({ version: "v1", auth });
    const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    const headers = msg.data.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value?.trim() || "(no subject)";
    const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value?.trim();
    const plain = gmailReadableBody(msg.data.payload, msg.data.snippet, subject);
    const stats = emailBodyStatsFromPlain(plain, subject);
    return {
      subject: subject.slice(0, 240),
      preview: stats.preview,
      bodyChars: stats.bodyChars,
      bodyWords: stats.bodyWords,
      to: to?.slice(0, 160),
    };
  } catch {
    return null;
  }
}

/** Merge Gmail API rows with audit rows so every email has char/word counts when possible. */
export async function mergeAndEnrichEmails(
  userEmail: string,
  auditEmails: WorkspaceActivityItem[],
  gmailSnippets: GmailSentSnippet[],
  gmailWarning?: string,
): Promise<{ emails: WorkspaceActivityItem[]; gmailEnriched: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  if (gmailWarning) warnings.push(gmailWarning);

  const gmailItems = gmailSnippetsToActivityItems(gmailSnippets);
  const gmailByKey = new Map<string, WorkspaceActivityItem>();
  for (const g of gmailItems) {
    gmailByKey.set(`${minuteKey(g.at)}|${normSubject(g.title)}`, g);
  }

  const usedGmail = new Set<string>();
  const merged: WorkspaceActivityItem[] = [];
  let idFetches = 0;

  for (const audit of auditEmails) {
    const key = `${minuteKey(audit.at)}|${normSubject(audit.title)}`;
    const hit = gmailByKey.get(key);
    if (hit) {
      usedGmail.add(key);
      merged.push(hit);
      continue;
    }

    const messageId = pickMeta(audit.meta ?? {}, ["message_id", "gmail_message_id", "msg_id"]);
    if (messageId && idFetches < MAX_GMAIL_BY_ID) {
      idFetches += 1;
      const fetched = await fetchGmailMessageStats(userEmail, messageId);
      if (fetched) {
        merged.push(
          ensureActivityItemStats({
            ...audit,
            title: fetched.subject,
            preview: fetched.preview,
            bodyChars: fetched.bodyChars,
            bodyWords: fetched.bodyWords,
            to: fetched.to ?? audit.to,
            source: "gmail",
          }),
        );
        continue;
      }
    }

    const fallback = auditEmailTextStats(audit.meta ?? {}, audit.title);
    merged.push(
      ensureActivityItemStats({
        ...audit,
        preview: fallback.preview,
        bodyChars: fallback.bodyChars,
        bodyWords: fallback.bodyWords,
        to: audit.to ?? humanEmailRecipient(audit.meta ?? {}),
      }),
    );
  }

  for (const g of gmailItems) {
    const key = `${minuteKey(g.at)}|${normSubject(g.title)}`;
    if (!usedGmail.has(key)) merged.push(g);
  }

  if (gmailSnippets.length === 0 && auditEmails.length === 0) {
    return { emails: [], gmailEnriched: false, warnings };
  }

  const gmailEnriched = gmailSnippets.length > 0 || merged.some((e) => e.source === "gmail");
  merged.sort((a, b) => b.at.localeCompare(a.at));
  return {
    emails: merged.map((e) => ensureActivityItemStats(e)),
    gmailEnriched,
    warnings,
  };
}

export async function enrichGoogleDocsWithContent(
  userEmail: string,
  docs: WorkspaceActivityItem[],
): Promise<{ docs: WorkspaceActivityItem[]; warning?: string }> {
  const withIds = docs
    .map((d, i) => ({
      item: d,
      docId: pickDocIdFromItem(d),
      index: i,
    }))
    .filter((x) => x.docId)
    .slice(0, MAX_DOC_RICH);

  if (!withIds.length) {
    return {
      docs: docs.map((d) =>
        ensureActivityItemStats({
          ...d,
          category: d.category ?? inferContentCategory(d.title, d.preview ?? d.title),
        }),
      ),
      warning:
        docs.length > 0
          ? "Docs: audit rows missing doc_id — add Drive/Docs readonly delegation or check Drive audit retention."
          : undefined,
    };
  }

  try {
    const auth = await loadServiceAccountJwtForSubject(userEmail, [DRIVE_READONLY_SCOPE, DOCS_READONLY_SCOPE]);
    const docsApi = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });
    const out = [...docs];
    const concurrency = 4;
    let cursor = 0;
    const bodyReadErrors: string[] = [];

    async function worker() {
      while (cursor < withIds.length) {
        const slot = cursor++;
        const { item, docId, index } = withIds[slot]!;
        let title = item.title;
        try {
          const file = await drive.files.get({
            fileId: docId!,
            fields: "name,mimeType",
            supportsAllDrives: true,
          });
          const name = String(file.data.name || "").trim();
          if (name) title = name;
        } catch {
          /* keep audit title */
        }

        const bodyR = await fetchGoogleDocBodyPlain(drive, docsApi, docId!);
        if (bodyR.apiTitle) title = bodyR.apiTitle;
        const stats = docContentStats(bodyR.plain, title);
        if (!stats.bodyChars && bodyR.error) {
          bodyReadErrors.push(`${title}: ${bodyR.error}`);
        }
        out[index] = ensureActivityItemStats({
          ...item,
          title,
          preview: stats.preview,
          bodyChars: stats.bodyChars,
          bodyWords: stats.bodyWords,
          category: inferContentCategory(title, bodyR.plain || title),
          source: stats.bodyChars > 0 ? "drive" : item.source ?? "audit",
          detail: item.detail ?? `Doc ID: ${docId}`,
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, withIds.length) }, () => worker()));
    const warning =
      bodyReadErrors.length > 0
        ? `Docs body: could not read ${bodyReadErrors.length} file(s). In Google Admin → Security → API controls → Domain-wide delegation, add scopes https://www.googleapis.com/auth/drive.readonly and https://www.googleapis.com/auth/documents.readonly for your service account client. Example: ${bodyReadErrors[0]}`
        : undefined;
    return { docs: out.map((d) => ensureActivityItemStats(d)), warning };
  } catch (e) {
    return {
      docs: docs.map((d) =>
        ensureActivityItemStats({
          ...d,
          ...docContentStats("", d.title),
          bodyChars: 0,
          bodyWords: 0,
        }),
      ),
      warning: `Google Docs read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function enrichChatsForUser(
  userEmail: string,
  startTime: string,
  endTime: string,
  auditChats: WorkspaceActivityItem[],
): Promise<{ chats: WorkspaceActivityItem[]; chatEnriched: boolean; warnings: string[] }> {
  const apiR = await listUserChatMessagesRich(userEmail, startTime, endTime);
  return mergeAndEnrichChats(auditChats, apiR.items, apiR.warning);
}

function pickDocIdFromItem(item: WorkspaceActivityItem): string | null {
  const fromDetail = item.detail?.match(/doc[_\s-]?id[:\s]+([a-zA-Z0-9_-]+)/i)?.[1];
  if (fromDetail) return fromDetail;
  if (item.meta) {
    const fromMeta = pickDocIdFromMeta(item.meta);
    if (fromMeta) return fromMeta;
  }
  return null;
}

export function computeDetailStats(detail: {
  emails: WorkspaceActivityItem[];
  chats: WorkspaceActivityItem[];
  docs: WorkspaceActivityItem[];
  meetings: WorkspaceActivityItem[];
}) {
  const emailChars = detail.emails.reduce((n, e) => n + (e.bodyChars ?? 0), 0);
  const chatChars = detail.chats.reduce((n, c) => n + (c.bodyChars ?? (c.preview?.length ?? 0)), 0);
  const docWords = detail.docs.reduce((n, d) => n + (d.bodyWords ?? 0), 0);
  const docChars = detail.docs.reduce((n, d) => n + (d.bodyChars ?? 0), 0);
  const ec = detail.emails.length || 1;
  const cc = detail.chats.length || 1;
  const dc = detail.docs.length || 1;
  return {
    emails: {
      count: detail.emails.length,
      totalBodyChars: emailChars,
      avgBodyChars: detail.emails.length ? Math.round(emailChars / ec) : 0,
    },
    chats: {
      count: detail.chats.length,
      totalBodyChars: chatChars,
      avgBodyChars: detail.chats.length ? Math.round(chatChars / cc) : 0,
    },
    docs: {
      count: detail.docs.length,
      totalBodyChars: docChars,
      totalWords: docWords,
      avgWords: detail.docs.length ? Math.round(docWords / dc) : 0,
    },
    meetings: { count: detail.meetings.length },
  };
}
