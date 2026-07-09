import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import type { PayrollAccessFile, PayrollAccessMember } from "@/lib/payroll-rbac.schema";

const BOOTSTRAP_MEMBERS: Omit<PayrollAccessMember, "grantedAt">[] = [
  {
    id: "pay-acc-mohita-yadav",
    email: "mohita@cintara.ai",
    displayName: "Mohita Yadav",
    grantedBy: "bootstrap",
    active: true,
    note: "People Ops — payroll module access",
  },
  {
    id: "pay-acc-thirumalai",
    email: "thirumalai@cintara.ai",
    displayName: "Thirumalai",
    grantedBy: "bootstrap",
    active: true,
    note: "Payroll module access",
  },
];

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

export function payrollRbacBucketName() {
  return process.env.ALYSON_HR_PAYROLL_RBAC_S3_BUCKET || process.env.ALYSON_HR_ORGCHART_S3_BUCKET || "alyson-hr-orgchart";
}

export function payrollRbacAccessKey() {
  return process.env.ALYSON_HR_PAYROLL_RBAC_S3_KEY || "payroll/rbac/access.json";
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

function normEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function bootstrapAccessFile(): PayrollAccessFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    members: BOOTSTRAP_MEMBERS.map((m) => ({ ...m, grantedAt: now })),
  };
}

async function writeAccessFile(file: PayrollAccessFile) {
  const bucket = payrollRbacBucketName();
  const key = payrollRbacAccessKey();
  await ensureBucketExists(bucket);
  file.updatedAt = new Date().toISOString();
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(file, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("payroll", "rbac"),
    }),
  );
}

async function readAccessFile(): Promise<PayrollAccessFile> {
  const bucket = payrollRbacBucketName();
  const key = payrollRbacAccessKey();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return bootstrapAccessFile();
    const parsed = JSON.parse(await streamToString(r.Body)) as PayrollAccessFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.members)) return bootstrapAccessFile();
    return parsed;
  } catch (e) {
    if (isMissingObjectError(e)) return bootstrapAccessFile();
    throw e;
  }
}

export async function ensurePayrollAccessOnS3(): Promise<PayrollAccessFile & { bucket: string; key: string }> {
  let file = await readAccessFile();
  const bucket = payrollRbacBucketName();
  const key = payrollRbacAccessKey();

  const needsBootstrap = !file.members.length;
  if (needsBootstrap) {
    file = bootstrapAccessFile();
    await writeAccessFile(file);
  }

  return { ...file, bucket, key };
}

export async function loadPayrollAccessMembers(): Promise<PayrollAccessMember[]> {
  const file = await ensurePayrollAccessOnS3();
  return file.members.filter((m) => m.active !== false);
}

export function findPayrollAccessMember(
  members: PayrollAccessMember[],
  email: string,
  clerkUserId?: string | null,
): PayrollAccessMember | undefined {
  const e = normEmail(email);
  const uid = String(clerkUserId || "").trim();
  return members.find((m) => {
    if (m.active === false) return false;
    if (uid && m.clerkUserId && m.clerkUserId === uid) return true;
    return normEmail(m.email) === e;
  });
}

export async function linkPayrollAccessClerkUser(email: string, clerkUserId: string): Promise<void> {
  const uid = String(clerkUserId || "").trim();
  if (!uid) return;

  const file = await ensurePayrollAccessOnS3();
  const member = findPayrollAccessMember(file.members, email, null);
  if (!member || member.clerkUserId === uid) return;

  member.clerkUserId = uid;
  member.linkedAt = new Date().toISOString();
  await writeAccessFile(file);
}
