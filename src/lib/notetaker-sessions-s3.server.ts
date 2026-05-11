import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";

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
  const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // fall through
  }
  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: { LocationConstraint: region },
        });
  await client.send(cmd);
}

async function streamToString(stream: any) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

export type NotetakerSessionsIndex = {
  version: 1;
  generatedAt: string;
  sessions: NotetakerSession[];
};

function bucketName() {
  // Use the same bucket as notetaker persistence by default.
  return requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
}

function keyName() {
  return "alyson-notetaker/sessions/index.json";
}

export async function putNotetakerSessionsIndexToS3(args: {
  sessions: NotetakerSession[];
  generatedAt?: string;
}) {
  const bucket = bucketName();
  await ensureBucketExists(bucket);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const body = JSON.stringify(
    { version: 1, generatedAt, sessions: args.sessions } satisfies NotetakerSessionsIndex,
    null,
    2,
  );
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: keyName(),
      Body: body,
      ContentType: "application/json; charset=utf-8",
      Metadata: {
        "x-amz-meta-kind": "alyson-notetaker-sessions-index",
        "x-amz-meta-version": "1",
        "x-amz-meta-generated-at": generatedAt,
      },
    }),
  );
  return { bucket, key: keyName(), generatedAt, count: args.sessions.length };
}

export async function getNotetakerSessionsIndexFromS3(): Promise<NotetakerSessionsIndex> {
  const bucket = bucketName();
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: keyName() }));
  if (!r.Body) throw new Error("Sessions index not found in S3");
  const text = await streamToString(r.Body);
  const parsed = JSON.parse(text) as NotetakerSessionsIndex;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
    throw new Error("Invalid sessions index format");
  }
  return parsed;
}

