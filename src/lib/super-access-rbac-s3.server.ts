import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { SUPER_ACCESS_EMAILS } from "@/lib/super-access-constants";
import type { SuperAccessFile, SuperAccessMember } from "@/lib/super-access-rbac.schema";

const BOOTSTRAP_MEMBERS: Omit<SuperAccessMember, "grantedAt">[] = [
  {
    id: "super-acc-thirumalai",
    email: "thirumalai@cintara.ai",
    displayName: "Thirumalai",
    grantedBy: "bootstrap",
    active: true,
    note: "Super access — payroll, bonus, equity, workspace, leave",
  },
  {
    id: "super-acc-mohita",
    email: "mohita@cintara.ai",
    displayName: "Mohita Yadav",
    grantedBy: "bootstrap",
    active: true,
    note: "Super access — payroll, bonus, equity, workspace, leave",
  },
  {
    id: "super-acc-arman",
    email: "arman@cintara.ai",
    displayName: "Arman",
    grantedBy: "bootstrap",
    active: true,
    note: "Super access — payroll, bonus, equity, workspace, leave",
  },
  {
    id: "super-acc-alysonclient",
    email: "alysonclient@cintara.ai",
    displayName: "Alyson Client",
    grantedBy: "bootstrap",
    active: true,
    note: "Super access — payroll, bonus, equity, workspace, leave",
  },
  {
    id: "super-acc-hamza",
    email: "hamza@cintara.ai",
    displayName: "Hamza",
    grantedBy: "bootstrap",
    active: true,
    note: "Super access — payroll, bonus, equity, workspace, leave",
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

export function superAccessRbacBucketName() {
  return process.env.ALYSON_SUPER_ACCESS_RBAC_S3_BUCKET || process.env.ALYSON_HR_ORGCHART_S3_BUCKET || "alyson-hr-orgchart";
}

export function superAccessRbacAccessKey() {
  return process.env.ALYSON_SUPER_ACCESS_RBAC_S3_KEY || "super-access/rbac/access.json";
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

function bootstrapAccessFile(): SuperAccessFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    members: BOOTSTRAP_MEMBERS.map((m) => ({ ...m, grantedAt: now })),
  };
}

async function writeAccessFile(file: SuperAccessFile) {
  const bucket = superAccessRbacBucketName();
  const key = superAccessRbacAccessKey();
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

async function readAccessFile(): Promise<SuperAccessFile> {
  const bucket = superAccessRbacBucketName();
  const key = superAccessRbacAccessKey();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return bootstrapAccessFile();
    const parsed = JSON.parse(await streamToString(r.Body)) as SuperAccessFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.members)) return bootstrapAccessFile();
    return parsed;
  } catch (e) {
    if (isMissingObjectError(e)) return bootstrapAccessFile();
    throw e;
  }
}

export async function ensureSuperAccessOnS3(): Promise<SuperAccessFile & { bucket: string; key: string }> {
  const bucket = superAccessRbacBucketName();
  const key = superAccessRbacAccessKey();
  let file = await readAccessFile();
  if (!file.members.length) {
    file = bootstrapAccessFile();
    await writeAccessFile(file);
  }
  return { ...file, bucket, key };
}

export async function loadSuperAccessMembers(): Promise<SuperAccessMember[]> {
  const file = await ensureSuperAccessOnS3();
  return file.members.filter((m) => m.active);
}

export function findSuperAccessMember(
  members: SuperAccessMember[],
  email: string,
  clerkUserId?: string | null,
): SuperAccessMember | undefined {
  const norm = email.trim().toLowerCase();
  return members.find(
    (m) =>
      m.active &&
      (m.email.trim().toLowerCase() === norm ||
        (clerkUserId && m.clerkUserId && m.clerkUserId === clerkUserId)),
  );
}

export async function linkSuperAccessClerkUser(email: string, clerkUserId: string): Promise<void> {
  const norm = email.trim().toLowerCase();
  if (!norm || !clerkUserId) return;

  const file = await ensureSuperAccessOnS3();
  const member = findSuperAccessMember(file.members, email, null);
  if (!member || member.clerkUserId === clerkUserId) return;

  member.clerkUserId = clerkUserId;
  member.linkedAt = new Date().toISOString();
  await writeAccessFile(file);
}

/** Ensure bootstrap emails from constants exist in S3 (e.g. after adding new privileged users). */
export async function syncSuperAccessBootstrapMembers(): Promise<void> {
  const file = await ensureSuperAccessOnS3();
  const now = new Date().toISOString();
  let changed = false;

  for (const email of SUPER_ACCESS_EMAILS) {
    const norm = email.toLowerCase();
    const exists = file.members.some((m) => m.email.trim().toLowerCase() === norm);
    if (exists) continue;
    const bootstrap = BOOTSTRAP_MEMBERS.find((m) => m.email.toLowerCase() === norm);
    file.members.push({
      ...(bootstrap ?? {
        id: `super-acc-${norm.split("@")[0]}`,
        email: norm,
        displayName: norm.split("@")[0],
        grantedBy: "bootstrap",
        active: true,
        note: "Super access",
      }),
      grantedAt: now,
    });
    changed = true;
  }

  if (changed) await writeAccessFile(file);
}
