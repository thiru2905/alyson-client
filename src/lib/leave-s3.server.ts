import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type {
  EmployeeLeaveLedger,
  LeaveDataFile,
  LeaveLogEntry,
  LeaveOperation,
  LeaveRecordEvent,
} from "@/lib/leave-schema";
import { leaveDaysInclusive, newLeaveEventId, validateLifetimeLeaveLimit } from "@/lib/leave-schema";
import { ensureOnboardingOnS3 } from "@/lib/onboarding-s3.server";
import type { OnboardingRow } from "@/lib/onboarding-schema";
import { enrichLeaveLedgersWithPacingActive } from "@/lib/weekly-pacing-active.server";

export const LEAVE_S3_BUCKET = "alyson-hr-orgchart";
export const LEAVE_S3_KEY = "leave/data.json";
export const LEAVE_LOG_S3_KEY = "leave/operations.log.jsonl";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (required for S3)`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary} (required for S3)`);
  return v;
}

function s3() {
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  return new S3Client({
    region,
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // create below
  }
  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: { LocationConstraint: region as never },
        });
  await client.send(cmd);
}

async function streamToString(stream: unknown) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.Code === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}

function employeeIdFromRow(row: OnboardingRow): string {
  return String(row["Employee ID"] ?? row._rowId ?? "").trim();
}

function ledgerFromOnboardingRow(
  row: OnboardingRow,
  existing?: EmployeeLeaveLedger | null,
): EmployeeLeaveLedger {
  const employeeId = employeeIdFromRow(row);
  const now = new Date().toISOString();
  return {
    employeeId,
    employeeName: String(row.Name ?? existing?.employeeName ?? "").trim() || employeeId,
    officialEmail: String(row["Official Email"] ?? existing?.officialEmail ?? "").trim(),
    jobTitle: String(row["Job Title"] ?? existing?.jobTitle ?? "").trim(),
    team: String(row.Team ?? existing?.team ?? "").trim(),
    location: String(row.Location ?? existing?.location ?? "").trim(),
    active: true,
    leaveEvents: existing?.leaveEvents ?? [],
    updatedAt: existing?.updatedAt ?? now,
  };
}

export function syncLeaveLedgersWithOnboarding(
  onboardingRows: OnboardingRow[],
  existing: Record<string, EmployeeLeaveLedger>,
): Record<string, EmployeeLeaveLedger> {
  const next: Record<string, EmployeeLeaveLedger> = {};
  const seen = new Set<string>();

  for (const row of onboardingRows) {
    const id = employeeIdFromRow(row);
    if (!id) continue;
    seen.add(id);
    next[id] = ledgerFromOnboardingRow(row, existing[id]);
  }

  for (const [id, ledger] of Object.entries(existing)) {
    if (seen.has(id)) continue;
    next[id] = { ...ledger, active: false };
  }

  return next;
}

async function readLogTail(): Promise<string> {
  const bucket = LEAVE_S3_BUCKET;
  const key = LEAVE_LOG_S3_KEY;
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return "";
    return await streamToString(r.Body);
  } catch (err) {
    if (isMissingObjectError(err)) return "";
    throw err;
  }
}

export async function appendLeaveLog(entry: LeaveLogEntry) {
  const bucket = LEAVE_S3_BUCKET;
  const key = LEAVE_LOG_S3_KEY;
  await ensureBucketExists(bucket);
  const line = `${JSON.stringify(entry)}\n`;
  const existing = await readLogTail();
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: existing + line,
      ContentType: "application/x-ndjson; charset=utf-8",
      Metadata: {
        "x-amz-meta-kind": "alyson-hr-leave-log",
        "x-amz-meta-updated-at": entry.ts,
      },
    }),
  );
  return { bucket, key };
}

export async function getLeaveOperationsLog(limit = 200) {
  const bucket = LEAVE_S3_BUCKET;
  const key = LEAVE_LOG_S3_KEY;
  const raw = await readLogTail();
  if (!raw.trim()) return { entries: [] as LeaveLogEntry[], bucket, key };

  const entries = raw
    .trim()
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as LeaveLogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LeaveLogEntry => e != null);

  return { entries: entries.slice(-limit).reverse(), bucket, key };
}

export async function getLeaveFromS3() {
  const bucket = LEAVE_S3_BUCKET;
  const key = LEAVE_S3_KEY;
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return { file: null as LeaveDataFile | null, bucket, key };
    const parsed = JSON.parse(await streamToString(r.Body)) as LeaveDataFile;
    return { file: parsed, bucket, key };
  } catch (err) {
    if (isMissingObjectError(err)) return { file: null, bucket, key };
    throw err;
  }
}

async function putLeaveToS3(
  employees: Record<string, EmployeeLeaveLedger>,
  args: {
    op: LeaveOperation;
    actor?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    details?: string;
    event?: LeaveRecordEvent;
    syncedFromOnboardingAt?: string | null;
  },
) {
  const bucket = LEAVE_S3_BUCKET;
  const key = LEAVE_S3_KEY;
  await ensureBucketExists(bucket);

  const updatedAt = new Date().toISOString();
  const body: LeaveDataFile = {
    version: 1,
    updatedAt,
    syncedFromOnboardingAt: args.syncedFromOnboardingAt ?? updatedAt,
    employees,
  };

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Metadata: {
        "x-amz-meta-kind": "alyson-hr-leave-data",
        "x-amz-meta-updated-at": updatedAt,
      },
    }),
  );

  await appendLeaveLog({
    ts: updatedAt,
    op: args.op,
    actor: args.actor ?? null,
    employeeId: args.employeeId ?? null,
    employeeName: args.employeeName ?? null,
    details: args.details,
    event: args.event,
    employeeCount: Object.keys(employees).length,
  });

  return { bucket, key, updatedAt, employees };
}

export async function ensureLeaveOnS3(actor?: string | null) {
  const onboarding = await ensureOnboardingOnS3(actor);
  const existing = await getLeaveFromS3();
  const prevEmployees = existing.file?.employees ?? {};
  const synced = syncLeaveLedgersWithOnboarding(onboarding.rows, prevEmployees);
  const onboardingIds = new Set(
    onboarding.rows.map((row) => employeeIdFromRow(row)).filter((id) => Boolean(id)),
  );
  const merged = await enrichLeaveLedgersWithPacingActive(synced, onboardingIds);

  const prevCount = Object.keys(prevEmployees).length;
  const mergedCount = Object.keys(merged).length;
  const isBootstrap = prevCount === 0;
  const rosterChanged =
    !existing.file ||
    mergedCount !== prevCount ||
    onboarding.rows.some((row) => {
      const id = employeeIdFromRow(row);
      const prev = prevEmployees[id];
      if (!prev) return true;
      return (
        prev.employeeName !== String(row.Name ?? "").trim() ||
        prev.officialEmail !== String(row["Official Email"] ?? "").trim() ||
        prev.team !== String(row.Team ?? "").trim() ||
        prev.location !== String(row.Location ?? "").trim() ||
        prev.jobTitle !== String(row["Job Title"] ?? "").trim()
      );
    }) ||
    Object.entries(merged).some(([id, ledger]) => prevEmployees[id]?.active !== ledger.active);

  if (!isBootstrap && !rosterChanged && existing.file) {
    return {
      employees: merged,
      updatedAt: existing.file.updatedAt,
      syncedFromOnboardingAt: existing.file.syncedFromOnboardingAt,
      bucket: existing.bucket,
      key: existing.key,
      logKey: LEAVE_LOG_S3_KEY,
      onboardingUpdatedAt: onboarding.updatedAt,
    };
  }

  const saved = await putLeaveToS3(merged, {
    op: isBootstrap ? "bootstrap" : "sync",
    actor: actor ?? null,
    details: isBootstrap
      ? `Bootstrapped leave ledger for ${mergedCount} employees from onboarding`
      : `Synced roster with onboarding (${mergedCount} ledgers)`,
    syncedFromOnboardingAt: new Date().toISOString(),
  });

  return {
    employees: saved.employees,
    updatedAt: saved.updatedAt,
    syncedFromOnboardingAt: saved.updatedAt,
    bucket: saved.bucket,
    key: saved.key,
    logKey: LEAVE_LOG_S3_KEY,
    onboardingUpdatedAt: onboarding.updatedAt,
  };
}

export async function appendLeaveRecord(args: {
  employeeId: string;
  leaveType: LeaveRecordEvent["leaveType"];
  startDate: string;
  endDate: string;
  days?: number;
  note?: string;
  actor?: string | null;
}) {
  const data = await ensureLeaveOnS3(args.actor ?? null);
  const ledger = data.employees[args.employeeId];
  if (!ledger) throw new Error("Employee not found in leave ledger");
  if (!ledger.active) throw new Error("Cannot record leave for inactive employee");

  const days = args.days ?? leaveDaysInclusive(args.startDate, args.endDate);
  const limitCheck = validateLifetimeLeaveLimit(ledger.leaveEvents, days);
  if (!limitCheck.ok) throw new Error(limitCheck.message);

  const event: LeaveRecordEvent = {
    id: newLeaveEventId(),
    leaveType: args.leaveType,
    startDate: args.startDate,
    endDate: args.endDate,
    days,
    note: args.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: args.actor ?? null,
  };

  const employees = {
    ...data.employees,
    [args.employeeId]: {
      ...ledger,
      leaveEvents: [...ledger.leaveEvents, event],
      updatedAt: event.createdAt,
    },
  };

  const saved = await putLeaveToS3(employees, {
    op: "append_leave",
    actor: args.actor ?? null,
    employeeId: ledger.employeeId,
    employeeName: ledger.employeeName,
    details: `Recorded ${days} day(s) ${args.leaveType} leave ${args.startDate} – ${args.endDate}`,
    event,
    syncedFromOnboardingAt: data.syncedFromOnboardingAt,
  });

  return { event, ledger: saved.employees[args.employeeId]! };
}

export async function voidLeaveRecord(args: {
  employeeId: string;
  eventId: string;
  actor?: string | null;
}) {
  const data = await ensureLeaveOnS3(args.actor ?? null);
  const ledger = data.employees[args.employeeId];
  if (!ledger) throw new Error("Employee not found in leave ledger");

  const removed = ledger.leaveEvents.find((e) => e.id === args.eventId);
  if (!removed) throw new Error("Leave record not found");

  const employees = {
    ...data.employees,
    [args.employeeId]: {
      ...ledger,
      leaveEvents: ledger.leaveEvents.filter((e) => e.id !== args.eventId),
      updatedAt: new Date().toISOString(),
    },
  };

  const saved = await putLeaveToS3(employees, {
    op: "void_leave",
    actor: args.actor ?? null,
    employeeId: ledger.employeeId,
    employeeName: ledger.employeeName,
    details: `Removed leave ${removed.startDate} – ${removed.endDate} (${removed.days}d) — snapshot kept in audit log`,
    event: removed,
    syncedFromOnboardingAt: data.syncedFromOnboardingAt,
  });

  return { removed, ledger: saved.employees[args.employeeId]! };
}
