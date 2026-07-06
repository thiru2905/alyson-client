/**
 * Apply cost-allocation tags to Alyson HR S3 buckets (one-time / after new buckets).
 *
 * Usage: npx dotenv-cli -e .env -- node scripts/tag-s3-buckets-cost.mjs
 *
 * Then in AWS Console: Billing → Cost allocation tags → activate Product, Environment, ManagedBy, Module, Resource.
 */
import { S3Client, PutBucketTaggingCommand } from "@aws-sdk/client-s3";

const PRODUCT = "alyson-hr";
const MANAGED_BY = "alyson-client";

function environment() {
  return (
    process.env.ALYSON_COST_ENV?.trim() ||
    process.env.AWS_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "production" : "development")
  );
}

function bucketNames() {
  const names = [
    process.env.AWS_S3_BUCKET?.trim(),
    process.env.S3_BUCKET?.trim(),
    process.env.ALYSON_HR_ORGCHART_S3_BUCKET?.trim(),
    process.env.ALYSON_HR_S3_BUCKET?.trim(),
    process.env.TIME_DOCTOR_TOKENS_S3_BUCKET?.trim(),
    "alyson-hr-orgchart",
    "alyson-hr-dummy-datas",
  ].filter(Boolean);
  return [...new Set(names)];
}

const region = process.env.AWS_REGION?.trim() || process.env.S3_REGION?.trim();
if (!region) {
  console.error("Missing AWS_REGION");
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const tagSet = [
  { Key: "Product", Value: PRODUCT },
  { Key: "Environment", Value: environment() },
  { Key: "ManagedBy", Value: MANAGED_BY },
];

for (const bucket of bucketNames()) {
  try {
    await client.send(
      new PutBucketTaggingCommand({
        Bucket: bucket,
        Tagging: { TagSet: tagSet },
      }),
    );
    console.log("Tagged bucket:", bucket, tagSet.map((t) => `${t.Key}=${t.Value}`).join(", "));
  } catch (e) {
    console.error("Failed:", bucket, e?.message || e);
  }
}

console.log("\nNext: AWS Billing → Cost allocation tags → activate Product, Module, Environment, ManagedBy, Resource.");
