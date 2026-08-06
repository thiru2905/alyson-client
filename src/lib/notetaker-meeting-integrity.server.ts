import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import {
  isGenericNormalizedTitle,
  normalizeMeetingTitleKey,
  parseLeadingDdMmYyyy,
  parseS3MeetingPrefix,
  resolveMeetingSchedule,
} from "@/lib/notetaker-meeting-schedule.server";
import { listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";
import { invalidateNotetakerCalendarS3Cache } from "@/lib/notetaker-s3-calendar.server";
import { readUnifiedScheduledStateFromS3 } from "@/lib/unified-scheduled-s3.server";

export type MeetingIntegrityIssue = {
  code:
    | "title_day_mismatch"
    | "missing_meeting_day"
    | "near_duplicate"
    | "generic_untitled"
    | "invalid_prefix";
  severity: "info" | "warn" | "error";
  botId: string;
  prefix: string;
  title: string;
  detail: string;
  repaired?: boolean;
};

export type MeetingIntegrityReport = {
  version: 1;
  ranAt: string;
  scanned: number;
  issues: MeetingIntegrityIssue[];
  repaired: number;
  superseded: number;
  warnings: string[];
};

type BotIndexIntegrityDoc = {
  version: number;
  botId: string;
  title?: string;
  prefix: string;
  transcriptKey?: string;
  notesKey?: string | null;
  finalizedAt?: string;
  lineCount?: number;
  wordCount?: number;
  transcriptHash?: string;
  notesHash?: string | null;
  cronFinalized?: boolean;
  /** Canonical calendar day — authenticity source for listing. */
  meetingDay?: string | null;
  meetingStartedAt?: string | null;
  meetingUrl?: string | null;
  integrityCheckedAt?: string | null;
  /** Soft-delete duplicate: another bot is the canonical copy. */
  supersededByBotId?: string | null;
  supersededAt?: string | null;
  recallCallEndedAt?: string | null;
  recallMediaDeletedAt?: string;
  [key: string]: unknown;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary}`);
  return v;
}

function s3() {
  return new S3Client({
    region: requireEnvAlias("AWS_REGION", ["S3_REGION"]),
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

function bucketName() {
  return requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
}

const NEAR_DUPLICATE_MS = 15 * 60_000;
/** Same Meet/Zoom URL can still get two bots with skewed start times — keep a wider window. */
const SAME_URL_NEAR_DUPLICATE_MS = 2 * 60 * 60_000;

/**
 * Rank duplicate bots. Longer transcript wins so we keep the richer copy when two bots join.
 * Notes / finalized are tie-breakers only (do not outweigh hundreds of transcript lines).
 */
function contentScore(doc: BotIndexIntegrityDoc): number {
  const lines = Math.max(0, Number(doc.lineCount || 0));
  return (
    lines * 1000 +
    (doc.transcriptKey ? 40 : 0) +
    (doc.notesKey ? 20 : 0) +
    (doc.cronFinalized ? 10 : 0) +
    (doc.supersededByBotId ? -1_000_000 : 0)
  );
}

function meetingStartMs(doc: BotIndexIntegrityDoc): number {
  return Date.parse(
    String(doc.meetingStartedAt || parseS3MeetingPrefix(doc.prefix).folderStartedAt || ""),
  );
}

async function markSuperseded(args: {
  winner: BotIndexIntegrityDoc;
  loser: BotIndexIntegrityDoc;
  ranAt: string;
}): Promise<void> {
  const { winner, loser, ranAt } = args;
  await writeBotIndexDoc({
    ...loser,
    supersededByBotId: String(winner.botId),
    supersededAt: ranAt,
    integrityCheckedAt: ranAt,
    meetingDay:
      loser.meetingDay ||
      computeAuthenticMeetingDay({
        title: String(loser.title || ""),
        prefix: String(loser.prefix),
      }).meetingDay,
  });
}

async function writeBotIndexDoc(doc: BotIndexIntegrityDoc): Promise<void> {
  const botId = String(doc.botId || "").trim();
  if (!botId) return;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`,
      Body: JSON.stringify(doc, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: botId }),
    }),
  );
}

async function writeIntegrityReport(report: MeetingIntegrityReport): Promise<void> {
  const body = JSON.stringify(report, null, 2);
  const day = report.ranAt.slice(0, 10);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: "alyson-notetaker/integrity/latest.json",
      Body: body,
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "integrity"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-integrity", ranAt: report.ranAt }),
    }),
  );
  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: `alyson-notetaker/integrity/history/${day}.json`,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "integrity"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-integrity", ranAt: report.ranAt }),
    }),
  );
}

/**
 * Compute authentic meeting day for a bot-index row.
 * Prefer title DDMMYYYY, else this row's own folder date — never another meeting's history.
 */
export function computeAuthenticMeetingDay(args: {
  title?: string | null;
  prefix: string;
  eventAt?: string | null;
}): { meetingDay: string; meetingStartedAt: string | null; daySource: string } {
  const schedule = resolveMeetingSchedule({
    title: String(args.title || "").trim() || "Meeting",
    prefix: args.prefix,
    eventAt: args.eventAt ?? null,
  });
  return {
    meetingDay: schedule.day,
    meetingStartedAt: schedule.startedAt,
    daySource: schedule.daySource,
  };
}

/**
 * Guard used at persist-time: if title carries DDMMYYYY, the S3 folder date must match.
 * Returns a repaired prefix when an existing index is absent and would otherwise use a wrong day.
 */
export function assertPersistPrefixIntegrity(args: {
  title: string;
  prefix: string;
  createdAt?: string | null;
}): { ok: boolean; prefix: string; meetingDay: string; reason?: string } {
  const schedule = resolveMeetingSchedule({
    title: args.title,
    prefix: args.prefix,
    eventAt: args.createdAt ?? null,
  });
  const parsed = parseS3MeetingPrefix(args.prefix);
  const titleDay = parseLeadingDdMmYyyy(args.title);

  if (titleDay && parsed.folderDate && titleDay !== parsed.folderDate) {
    const repairedPrefix = `${parsed.name}_${titleDay}_${parsed.time || "12-00-00"}`;
    return {
      ok: false,
      prefix: repairedPrefix,
      meetingDay: titleDay,
      reason: `title_day ${titleDay} != folder_day ${parsed.folderDate}`,
    };
  }

  return { ok: true, prefix: args.prefix, meetingDay: schedule.day };
}

/**
 * Full integrity pass over bot-index:
 * - stamps meetingDay / meetingStartedAt
 * - marks near-duplicates as superseded (keeps richest copy)
 * - writes S3 integrity report
 *
 * Safe by default: does not delete S3 transcript/notes folders — only updates bot-index metadata
 * so calendar/list stop showing false duplicates / wrong days.
 */
export async function runNotetakerMeetingIntegrityCheck(options?: {
  repair?: boolean;
}): Promise<MeetingIntegrityReport> {
  const ranAt = new Date().toISOString();
  const warnings: string[] = [];
  const issues: MeetingIntegrityIssue[] = [];
  let repaired = 0;
  let superseded = 0;

  const repair = options?.repair ?? true;
  const docs = (await listAllBotIndexDocs()) as BotIndexIntegrityDoc[];
  const active = docs.filter((d) => String(d.botId || "").trim() && String(d.prefix || "").trim());

  // Pass 1: stamp / fix meetingDay on each bot-index
  for (const doc of active) {
    const botId = String(doc.botId).trim();
    const prefix = String(doc.prefix).trim();
    const title = String(doc.title || "").trim() || parseS3MeetingPrefix(prefix).displayName || "Meeting";
    const parsed = parseS3MeetingPrefix(prefix);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.folderDate)) {
      issues.push({
        code: "invalid_prefix",
        severity: "error",
        botId,
        prefix,
        title,
        detail: "Prefix missing YYYY-MM-DD date segment",
      });
      continue;
    }

    const auth = computeAuthenticMeetingDay({ title, prefix });
    const titleDay = parseLeadingDdMmYyyy(title);
    if (titleDay && titleDay !== parsed.folderDate) {
      issues.push({
        code: "title_day_mismatch",
        severity: "warn",
        botId,
        prefix,
        title,
        detail: `Title day ${titleDay} vs folder day ${parsed.folderDate}; canonical=${auth.meetingDay}`,
      });
    }

    const titleKey = normalizeMeetingTitleKey(title);
    if (isGenericNormalizedTitle(titleKey)) {
      issues.push({
        code: "generic_untitled",
        severity: "info",
        botId,
        prefix,
        title,
        detail: "Untitled/system default title — hidden from calendar listing",
      });
    }

    const needsDay =
      !doc.meetingDay ||
      doc.meetingDay !== auth.meetingDay ||
      (!doc.meetingStartedAt && auth.meetingStartedAt);

    if (needsDay) {
      issues.push({
        code: "missing_meeting_day",
        severity: "warn",
        botId,
        prefix,
        title,
        detail: `Set meetingDay=${auth.meetingDay} (was ${doc.meetingDay || "unset"})`,
        repaired: false,
      });
      if (repair) {
        await writeBotIndexDoc({
          ...doc,
          meetingDay: auth.meetingDay,
          meetingStartedAt: auth.meetingStartedAt,
          integrityCheckedAt: ranAt,
        });
        repaired += 1;
        issues[issues.length - 1]!.repaired = true;
      }
    } else if (repair && doc.integrityCheckedAt !== ranAt) {
      await writeBotIndexDoc({
        ...doc,
        integrityCheckedAt: ranAt,
      });
    }
  }

  // Pass 2: soft-supersede near-duplicates — keep the bot with the longer transcript.
  // Groups: (a) same day + title within 15m, (b) same meeting URL within 2h (skewed start times).
  const fresh = repair ? ((await listAllBotIndexDocs()) as BotIndexIntegrityDoc[]) : active;
  const candidates = fresh.filter(
    (d) => String(d.botId || "").trim() && String(d.prefix || "").trim() && !d.supersededByBotId,
  );
  const byBotId = new Map(candidates.map((d) => [String(d.botId).trim(), d]));

  const groups = new Map<string, BotIndexIntegrityDoc[]>();
  const addToGroup = (key: string, doc: BotIndexIntegrityDoc) => {
    const arr = groups.get(key) ?? [];
    arr.push(doc);
    groups.set(key, arr);
  };

  for (const doc of candidates) {
    const title = String(doc.title || "").trim() || parseS3MeetingPrefix(doc.prefix).displayName;
    const titleKey = normalizeMeetingTitleKey(title);
    if (isGenericNormalizedTitle(titleKey)) continue;
    const day =
      doc.meetingDay ||
      computeAuthenticMeetingDay({ title, prefix: doc.prefix }).meetingDay ||
      parseS3MeetingPrefix(doc.prefix).folderDate;
    addToGroup(`title|${day}|${titleKey}`, doc);
  }

  try {
    const state = await readUnifiedScheduledStateFromS3();
    const urlGroups = new Map<string, BotIndexIntegrityDoc[]>();
    const addUrlDoc = (url: string, doc: BotIndexIntegrityDoc) => {
      const key = url.trim().toLowerCase().replace(/\?.*$/, "");
      if (!key) return;
      const arr = urlGroups.get(key) ?? [];
      if (!arr.some((d) => String(d.botId) === String(doc.botId))) arr.push(doc);
      urlGroups.set(key, arr);
    };
    for (const row of state.scheduled) {
      const botId = String(row.recallBotId || "").trim();
      const url = String(row.meetingUrl || "").trim();
      if (!botId || !url) continue;
      const doc = byBotId.get(botId);
      if (!doc) continue;
      addUrlDoc(url, doc);
    }
    for (const doc of candidates) {
      const url = String(doc.meetingUrl || "").trim();
      if (url) addUrlDoc(url, doc);
    }
    for (const [url, docs] of urlGroups) {
      if (docs.length < 2) continue;
      groups.set(`url|${url}`, docs);
    }
  } catch (e) {
    warnings.push(`url_dedupe_lookup: ${String(e)}`);
  }

  const alreadySuperseded = new Set<string>();

  for (const [groupKey, group] of groups) {
    const live = group.filter((d) => !alreadySuperseded.has(String(d.botId)));
    if (live.length < 2) continue;

    const ranked = [...live].sort((a, b) => {
      const scoreDiff = contentScore(b) - contentScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.botId).localeCompare(String(b.botId));
    });
    const winner = ranked[0]!;
    const winnerStart = meetingStartMs(winner);
    const sameUrl = groupKey.startsWith("url|");
    const windowMs = sameUrl ? SAME_URL_NEAR_DUPLICATE_MS : NEAR_DUPLICATE_MS;

    for (const loser of ranked.slice(1)) {
      if (alreadySuperseded.has(String(loser.botId))) continue;
      const loserStart = meetingStartMs(loser);
      const close =
        Number.isFinite(winnerStart) && Number.isFinite(loserStart)
          ? Math.abs(winnerStart - loserStart) <= windowMs
          : sameUrl;
      if (!close) continue;

      const winnerLines = Number(winner.lineCount || 0);
      const loserLines = Number(loser.lineCount || 0);
      issues.push({
        code: "near_duplicate",
        severity: "warn",
        botId: String(loser.botId),
        prefix: String(loser.prefix),
        title: String(loser.title || ""),
        detail: sameUrl
          ? `Same meeting URL as ${winner.botId} within 2h — keeping longer transcript (${winnerLines} vs ${loserLines} lines)`
          : `Near-duplicate of ${winner.botId} (same title/day within 15m) — keeping longer transcript (${winnerLines} vs ${loserLines} lines)`,
        repaired: false,
      });

      if (repair) {
        await markSuperseded({ winner, loser, ranAt });
        alreadySuperseded.add(String(loser.botId));
        superseded += 1;
        issues[issues.length - 1]!.repaired = true;
      }
    }
  }

  const report: MeetingIntegrityReport = {
    version: 1,
    ranAt,
    scanned: active.length,
    issues: issues.slice(0, 200),
    repaired,
    superseded,
    warnings,
  };

  try {
    await writeIntegrityReport(report);
  } catch (e) {
    warnings.push(`integrity_report_write: ${String(e)}`);
    report.warnings = warnings;
  }

  if (repair && (repaired > 0 || superseded > 0)) {
    invalidateNotetakerCalendarS3Cache();
  }

  return report;
}
