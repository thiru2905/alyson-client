import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import type {
  PayrollDataFile,
  PayrollEmployeeOverrides,
  PayrollLogEntry,
  PayrollMonthSnapshot,
  PayrollOperation,
  PayrollPaidRecord,
  PayrollPayCycle,
  PayrollPeriodSettings,
  PayrollReport,
  PayrollReportRow,
} from "@/lib/payroll-schema";
import { paidRecordKey } from "@/lib/payroll-schema";

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

function bucketName() {
  return process.env.ALYSON_HR_ORGCHART_S3_BUCKET || "alyson-hr-orgchart";
}

function dataKey() {
  return process.env.ALYSON_HR_PAYROLL_S3_KEY || "payroll/data.json";
}

function logKey() {
  return process.env.ALYSON_HR_PAYROLL_LOG_S3_KEY || "payroll/operations.log.jsonl";
}

function snapshotKey(payMonth: string) {
  const prefix = process.env.ALYSON_HR_PAYROLL_SNAPSHOT_S3_PREFIX?.trim() || "payroll/snapshots";
  return `${prefix.replace(/\/$/, "")}/${payMonth}.json`;
}

export function currentPayMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function isPastPayMonth(payMonth: string): boolean {
  return /^\d{4}-\d{2}$/.test(payMonth) && payMonth < currentPayMonth();
}

export function listPastPayMonths(monthsBack: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
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

function emptyDataFile(): PayrollDataFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    employees: {},
    periods: {},
    paid: {},
  };
}

async function readDataFile(): Promise<PayrollDataFile> {
  const bucket = bucketName();
  const key = dataKey();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return emptyDataFile();
    const parsed = JSON.parse(await streamToString(r.Body)) as PayrollDataFile;
    if (!parsed || parsed.version !== 1) return emptyDataFile();
    parsed.employees = parsed.employees ?? {};
    parsed.periods = parsed.periods ?? {};
    parsed.paid = parsed.paid ?? {};
    return parsed;
  } catch (e) {
    if (isMissingObjectError(e)) return emptyDataFile();
    throw e;
  }
}

async function writeDataFile(file: PayrollDataFile) {
  const bucket = bucketName();
  const key = dataKey();
  await ensureBucketExists(bucket);
  file.updatedAt = new Date().toISOString();
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(file, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("payroll", "data"),
    }),
  );
}

async function appendLogEntry(entry: PayrollLogEntry) {
  const bucket = bucketName();
  const key = logKey();
  await ensureBucketExists(bucket);
  let existing = "";
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (r.Body) existing = await streamToString(r.Body);
  } catch (e) {
    if (!isMissingObjectError(e)) throw e;
  }
  const line = `${JSON.stringify(entry)}\n`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: existing + line,
      ContentType: "application/x-ndjson; charset=utf-8",
      Tagging: s3CostAllocationTagging("payroll", "log"),
    }),
  );
}

export async function ensurePayrollOnS3() {
  const file = await readDataFile();
  const bucket = bucketName();
  const key = dataKey();
  if (!Object.keys(file.employees).length && !Object.keys(file.periods).length) {
    await writeDataFile(file);
    await appendLogEntry({ ts: new Date().toISOString(), operation: "bootstrap" });
  }
  return { ...file, bucket, key, logKey: logKey() };
}

export async function getPayrollOperationsLog(limit = 500): Promise<PayrollLogEntry[]> {
  const bucket = bucketName();
  const key = logKey();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return [];
    const text = await streamToString(r.Body);
    const lines = text.split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as PayrollLogEntry)
      .reverse();
  } catch (e) {
    if (isMissingObjectError(e)) return [];
    throw e;
  }
}

export async function upsertPayrollEmployeeOverrides(
  employeeId: string,
  patch: Omit<PayrollEmployeeOverrides, "employeeId" | "updatedAt">,
  actor?: string | null,
) {
  const file = await readDataFile();
  const prev = file.employees[employeeId] ?? { employeeId };
  file.employees[employeeId] = {
    ...prev,
    ...patch,
    employeeId,
    updatedAt: new Date().toISOString(),
  };
  await writeDataFile(file);
  await appendLogEntry({
    ts: new Date().toISOString(),
    operation: "update_employee",
    actor: actor ?? null,
    employeeId,
    detailsJson: patch ? JSON.stringify(patch) : undefined,
  });
  return file.employees[employeeId]!;
}

export async function upsertPayrollPeriodSettings(
  month: string,
  patch: Omit<PayrollPeriodSettings, "month" | "updatedAt">,
  actor?: string | null,
) {
  const file = await readDataFile();
  const prev = file.periods[month] ?? { month };
  file.periods[month] = {
    ...prev,
    ...patch,
    month,
    updatedAt: new Date().toISOString(),
  };
  await writeDataFile(file);
  await appendLogEntry({
    ts: new Date().toISOString(),
    operation: "update_period_fx",
    actor: actor ?? null,
    payMonth: month,
    detailsJson: patch ? JSON.stringify(patch) : undefined,
  });
  return file.periods[month]!;
}

export async function markPayrollEmployeePaid(args: {
  record: PayrollPaidRecord;
  employeeName?: string;
  actor?: string | null;
}) {
  const file = await readDataFile();
  const key = paidRecordKey(args.record.employeeId, args.record.payMonth, args.record.payCycle);
  file.paid[key] = args.record;
  await writeDataFile(file);
  await appendLogEntry({
    ts: new Date().toISOString(),
    operation: "mark_paid",
    actor: args.actor ?? null,
    employeeId: args.record.employeeId,
    employeeName: args.employeeName,
    payMonth: args.record.payMonth,
    payCycle: args.record.payCycle,
    localCurrency: args.record.localCurrency,
    amountLocal: args.record.amountLocal,
    amountUsd: args.record.amountUsd,
    note: args.record.note ?? undefined,
  });
  await updatePayrollSnapshotPaidStatus({
    payMonth: args.record.payMonth,
    employeeId: args.record.employeeId,
    payCycle: args.record.payCycle,
    paidAt: args.record.paidAt,
    paidBy: args.record.paidBy ?? null,
  });
  return file.paid[key]!;
}

export async function unmarkPayrollEmployeePaid(args: {
  employeeId: string;
  payMonth: string;
  payCycle: PayrollPaidRecord["payCycle"];
  actor?: string | null;
  employeeName?: string;
}) {
  const file = await readDataFile();
  const key = paidRecordKey(args.employeeId, args.payMonth, args.payCycle);
  const prev = file.paid[key];
  delete file.paid[key];
  await writeDataFile(file);
  await appendLogEntry({
    ts: new Date().toISOString(),
    operation: "unmark_paid",
    actor: args.actor ?? null,
    employeeId: args.employeeId,
    employeeName: args.employeeName,
    payMonth: args.payMonth,
    payCycle: args.payCycle,
    amountLocal: prev?.amountLocal,
    amountUsd: prev?.amountUsd,
  });
  await updatePayrollSnapshotPaidStatus({
    payMonth: args.payMonth,
    employeeId: args.employeeId,
    payCycle: args.payCycle,
    paidAt: null,
    paidBy: null,
  });
  return { removed: Boolean(prev) };
}

export function getPaidRecord(
  file: PayrollDataFile,
  employeeId: string,
  payMonth: string,
  payCycle: PayrollPaidRecord["payCycle"],
): PayrollPaidRecord | null {
  return file.paid[paidRecordKey(employeeId, payMonth, payCycle)] ?? null;
}

export async function logPayrollOperation(
  operation: PayrollOperation,
  entry: Omit<PayrollLogEntry, "ts" | "operation">,
) {
  await appendLogEntry({ ts: new Date().toISOString(), operation, ...entry });
}

export async function loadPayrollMonthSnapshot(payMonth: string): Promise<PayrollMonthSnapshot | null> {
  const bucket = bucketName();
  const key = snapshotKey(payMonth);
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return null;
    const parsed = JSON.parse(await streamToString(r.Body)) as PayrollMonthSnapshot;
    if (!parsed || parsed.version !== 1 || parsed.payMonth !== payMonth) return null;
    parsed.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    return parsed;
  } catch (e) {
    if (isMissingObjectError(e)) return null;
    throw e;
  }
}

export async function savePayrollMonthSnapshot(report: PayrollReport, actor?: string | null) {
  const bucket = bucketName();
  const key = snapshotKey(report.payMonth);
  await ensureBucketExists(bucket);
  const snapshot: PayrollMonthSnapshot = {
    version: 1,
    payMonth: report.payMonth,
    capturedAt: report.generatedAt,
    usdToInrRate: report.usdToInrRate,
    usdToPkrRate: report.usdToPkrRate,
    rateAsOf: report.rateAsOf,
    rows: report.rows,
    warnings: report.warnings,
  };
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(snapshot, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("payroll", "snapshot"),
    }),
  );
  await appendLogEntry({
    ts: new Date().toISOString(),
    operation: "save_snapshot",
    actor: actor ?? null,
    payMonth: report.payMonth,
    detailsJson: JSON.stringify({ key, rowCount: report.rows.length, capturedAt: snapshot.capturedAt }),
  });
  return { bucket, key, snapshot };
}

export function mergePaidStatusIntoSnapshotRows(
  rows: PayrollReportRow[],
  file: PayrollDataFile,
  payMonth: string,
): PayrollReportRow[] {
  return rows.map((row) => {
    const paid = getPaidRecord(file, row.employeeId, payMonth, row.payCycle);
    if (!paid) return { ...row, paidAt: null, paidBy: null };
    return { ...row, paidAt: paid.paidAt, paidBy: paid.paidBy ?? null };
  });
}

export async function updatePayrollSnapshotPaidStatus(args: {
  payMonth: string;
  employeeId: string;
  payCycle: PayrollPayCycle;
  paidAt: string | null;
  paidBy?: string | null;
}) {
  const snapshot = await loadPayrollMonthSnapshot(args.payMonth);
  if (!snapshot) return { updated: false };

  let changed = false;
  snapshot.rows = snapshot.rows.map((row) => {
    if (row.employeeId !== args.employeeId || row.payCycle !== args.payCycle) return row;
    changed = true;
    return {
      ...row,
      paidAt: args.paidAt,
      paidBy: args.paidBy ?? null,
    };
  });
  if (!changed) return { updated: false };

  const bucket = bucketName();
  const key = snapshotKey(args.payMonth);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(snapshot, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("payroll", "snapshot"),
    }),
  );
  return { updated: true };
}
