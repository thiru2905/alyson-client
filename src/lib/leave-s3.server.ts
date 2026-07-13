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
  TeamLeaveEvent,
} from "@/lib/leave-schema";
import {
  formatTeamLeaveLabel,
  HALF_DAY_LEAVE_DAYS,
  leaveDaysInclusive,
  matchesTeamLocation,
  newLeaveEventId,
  newTeamLeaveEventId,
  validateLifetimeLeaveLimit,
} from "@/lib/leave-schema";
import { syncLeaveLedgersWithTimeDoctor, timeDoctorUserIds } from "@/lib/leave-roster.server";
import { getOrgChartRosterLookup } from "@/lib/org-chart-roster.server";
import {
  timeDoctorPacingGetCompany,
  timeDoctorPacingListUsers,
} from "@/lib/time-doctor-functions";
import { enrichLeaveLedgersWithPacingActive } from "@/lib/weekly-pacing-active.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";

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
      Tagging: s3CostAllocationTagging("leave", "log"),
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
    const file: LeaveDataFile = {
      ...parsed,
      teamLeaves: parsed.teamLeaves ?? [],
    };
    return { file, bucket, key };
  } catch (err) {
    if (isMissingObjectError(err)) return { file: null, bucket, key };
    throw err;
  }
}

async function putLeaveToS3(
  employees: Record<string, EmployeeLeaveLedger>,
  args: {
    teamLeaves: TeamLeaveEvent[];
    op: LeaveOperation;
    actor?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    details?: string;
    event?: LeaveRecordEvent;
    teamEvent?: TeamLeaveEvent;
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
    teamLeaves: args.teamLeaves,
  };

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("leave", "data"),
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
    teamEvent: args.teamEvent,
    employeeCount: Object.keys(employees).length,
  });

  return { bucket, key, updatedAt, employees, teamLeaves: args.teamLeaves };
}

export async function ensureLeaveOnS3(actor?: string | null) {
  const company = await timeDoctorPacingGetCompany();
  let users: Awaited<ReturnType<typeof timeDoctorPacingListUsers>> = [];
  try {
    users = await timeDoctorPacingListUsers(company.id);
  } catch {
    users = [];
  }

  const rosterLookup = getOrgChartRosterLookup();
  const existing = await getLeaveFromS3();
  const prevEmployees = existing.file?.employees ?? {};
  const prevTeamLeaves = existing.file?.teamLeaves ?? [];
  const synced = syncLeaveLedgersWithTimeDoctor(users, prevEmployees, rosterLookup);
  const tdIds = timeDoctorUserIds(users);
  const merged = await enrichLeaveLedgersWithPacingActive(synced, tdIds);

  const prevCount = Object.keys(prevEmployees).length;
  const mergedCount = Object.keys(merged).length;
  const isBootstrap = prevCount === 0;
  const rosterChanged =
    !existing.file ||
    mergedCount !== prevCount ||
    users.some((u) => {
      const prev = prevEmployees[u.id];
      if (!prev) return true;
      const email = String(u.email || "").trim();
      return (
        prev.employeeName !== String(u.name || email).trim() ||
        prev.officialEmail !== email ||
        prev.jobTitle !== String(u.title ?? "").trim()
      );
    }) ||
    Object.entries(merged).some(([id, ledger]) => prevEmployees[id]?.active !== ledger.active);

  if (!isBootstrap && !rosterChanged && existing.file) {
    return {
      employees: merged,
      teamLeaves: prevTeamLeaves,
      updatedAt: existing.file.updatedAt,
      syncedFromOnboardingAt: existing.file.syncedFromOnboardingAt,
      bucket: existing.bucket,
      key: existing.key,
      logKey: LEAVE_LOG_S3_KEY,
      rosterSource: "time-doctor" as const,
    };
  }

  const saved = await putLeaveToS3(merged, {
    teamLeaves: prevTeamLeaves,
    op: isBootstrap ? "bootstrap" : "sync",
    actor: actor ?? null,
    details: isBootstrap
      ? `Bootstrapped leave ledger for ${mergedCount} employees from Time Doctor`
      : `Synced roster with Time Doctor (${mergedCount} ledgers)`,
    syncedFromOnboardingAt: new Date().toISOString(),
  });

  return {
    employees: saved.employees,
    teamLeaves: saved.teamLeaves,
    updatedAt: saved.updatedAt,
    syncedFromOnboardingAt: saved.updatedAt,
    bucket: saved.bucket,
    key: saved.key,
    logKey: LEAVE_LOG_S3_KEY,
    rosterSource: "time-doctor" as const,
  };
}

export async function appendLeaveRecord(args: {
  employeeId: string;
  leaveType: LeaveRecordEvent["leaveType"];
  startDate: string;
  endDate: string;
  days?: number;
  /** Half day: single weekday, 0.5 day credit (+4h pacing). */
  halfDay?: boolean;
  note?: string;
  actor?: string | null;
  /** When true, record leave even if lifetime limit exceeded (salary deduction case). */
  allowOverLimit?: boolean;
}) {
  const data = await ensureLeaveOnS3(args.actor ?? null);
  const ledger = data.employees[args.employeeId];
  if (!ledger) throw new Error("Employee not found in leave ledger");
  if (!ledger.active) throw new Error("Cannot record leave for inactive employee");

  const halfDay = Boolean(args.halfDay);
  const startDate = args.startDate;
  const endDate = halfDay ? args.startDate : args.endDate;
  const days = halfDay
    ? HALF_DAY_LEAVE_DAYS
    : (args.days ?? leaveDaysInclusive(startDate, endDate));
  if (days <= 0) {
    throw new Error("Leave range has no weekdays (Sat–Sun are not counted).");
  }
  if (halfDay && leaveDaysInclusive(startDate, startDate) <= 0) {
    throw new Error("Half-day leave must fall on a weekday (Sat–Sun are not counted).");
  }
  if (!args.allowOverLimit) {
    const limitCheck = validateLifetimeLeaveLimit(ledger.leaveEvents, days);
    if (!limitCheck.ok) throw new Error(limitCheck.message);
  }

  const event: LeaveRecordEvent = {
    id: newLeaveEventId(),
    leaveType: args.leaveType,
    startDate,
    endDate,
    days,
    ...(halfDay ? { halfDay: true } : {}),
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
    teamLeaves: data.teamLeaves ?? [],
    op: "append_leave",
    actor: args.actor ?? null,
    employeeId: ledger.employeeId,
    employeeName: ledger.employeeName,
    details: halfDay
      ? `Recorded half day ${args.leaveType} leave ${startDate} (+4h pacing)`
      : `Recorded ${days} day(s) ${args.leaveType} leave ${startDate} – ${endDate}`,
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
    teamLeaves: data.teamLeaves ?? [],
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

export async function appendTeamLeaveRecord(args: {
  location: string;
  team: string;
  leaveType: TeamLeaveEvent["leaveType"];
  startDate: string;
  endDate: string;
  days?: number;
  note?: string;
  actor?: string | null;
}) {
  const data = await ensureLeaveOnS3(args.actor ?? null);
  const location = args.location.trim();
  const team = args.team.trim();
  if (!location || !team) throw new Error("Location and team are required");

  const days = args.days ?? leaveDaysInclusive(args.startDate, args.endDate);
  if (days <= 0) {
    throw new Error("Leave range has no weekdays (Sat–Sun are not counted).");
  }

  const affected = Object.values(data.employees).filter(
    (l) => l.active && matchesTeamLocation(l.location, l.team, location, team),
  );
  if (!affected.length) {
    throw new Error(
      `No active employees found for ${formatTeamLeaveLabel(team)} at ${location}`,
    );
  }

  const event: TeamLeaveEvent = {
    id: newTeamLeaveEventId(),
    location,
    team,
    leaveType: args.leaveType,
    startDate: args.startDate,
    endDate: args.endDate,
    days,
    note: args.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy: args.actor ?? null,
  };

  const teamLeaves = [...(data.teamLeaves ?? []), event];
  const saved = await putLeaveToS3(data.employees, {
    teamLeaves,
    op: "append_team_leave",
    actor: args.actor ?? null,
    details: `Team leave ${days} day(s) for ${formatTeamLeaveLabel(team)} @ ${location} (${args.startDate} – ${args.endDate}) · ${affected.length} employee(s)`,
    teamEvent: event,
    syncedFromOnboardingAt: data.syncedFromOnboardingAt,
  });

  return { event, affectedCount: affected.length, teamLeaves: saved.teamLeaves };
}

export async function voidTeamLeaveRecord(args: { eventId: string; actor?: string | null }) {
  const data = await ensureLeaveOnS3(args.actor ?? null);
  const teamLeaves = data.teamLeaves ?? [];
  const removed = teamLeaves.find((e) => e.id === args.eventId);
  if (!removed) throw new Error("Team leave record not found");

  const nextTeamLeaves = teamLeaves.filter((e) => e.id !== args.eventId);
  const saved = await putLeaveToS3(data.employees, {
    teamLeaves: nextTeamLeaves,
    op: "void_team_leave",
    actor: args.actor ?? null,
    details: `Removed team leave for ${formatTeamLeaveLabel(removed.team)} @ ${removed.location} (${removed.startDate} – ${removed.endDate})`,
    teamEvent: removed,
    syncedFromOnboardingAt: data.syncedFromOnboardingAt,
  });

  return { removed, teamLeaves: saved.teamLeaves };
}
