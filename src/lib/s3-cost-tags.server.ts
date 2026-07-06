/**
 * S3 object + bucket tags for AWS Cost Explorer (activate keys in Billing → Cost allocation tags).
 *
 * Object: PutObject `Tagging` query string (Product, Module, Environment, …).
 * Bucket: run `node scripts/tag-s3-buckets-cost.mjs` once per account/region.
 */

export type S3CostModule =
  | "leave"
  | "leave-email"
  | "onboarding"
  | "bonus"
  | "orgchart"
  | "handover"
  | "weekly-pacing"
  | "hr-overview"
  | "notetaker"
  | "notetaker-calendar"
  | "recall"
  | "unified-meetings"
  | "archive";

const PRODUCT = "alyson-hr";
const MANAGED_BY = "alyson-client";

export function s3CostEnvironment(): string {
  return (
    process.env.ALYSON_COST_ENV?.trim() ||
    process.env.AWS_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "production" : "development")
  );
}

/** URL-encoded `Tagging` header value for PutObjectCommand. */
export function s3CostAllocationTagging(module: S3CostModule, resource?: string): string {
  const tags: Record<string, string> = {
    Product: PRODUCT,
    Module: module,
    Environment: s3CostEnvironment(),
    ManagedBy: MANAGED_BY,
  };
  if (resource?.trim()) tags.Resource = resource.trim();
  return Object.entries(tags)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Infer module from S3 key prefix (archives, shared bucket). */
export function s3CostModuleFromObjectKey(key: string): S3CostModule {
  const k = key.replace(/^\/+/, "");
  if (k.startsWith("leave/email")) return "leave-email";
  if (k.startsWith("leave/")) return "leave";
  if (k.startsWith("onboarding/")) return "onboarding";
  if (k.startsWith("bonus/")) return "bonus";
  if (k.startsWith("orgchart") || k.startsWith("alyson-orgchart")) return "orgchart";
  if (k.startsWith("alyson-hr-handover") || k.startsWith("handover")) return "handover";
  if (k.startsWith("pacing/")) return "weekly-pacing";
  if (k.startsWith("alyson-hr/overview") || k === "alyson-hr/overview.json") return "hr-overview";
  if (k.startsWith("alyson-notetaker/unified-scheduled")) return "unified-meetings";
  if (k.startsWith("alyson-notetaker/recall-calendar")) return "recall";
  if (k.startsWith("alyson-notetaker/")) return "notetaker";
  if (k.startsWith("archive/")) return "archive";
  return "archive";
}

/** Unique bucket names used by Alyson HR (for one-time bucket tagging script). */
export function listAlysonHrS3BucketNames(): string[] {
  const names = [
    process.env.AWS_S3_BUCKET?.trim(),
    process.env.S3_BUCKET?.trim(),
    process.env.ALYSON_HR_ORGCHART_S3_BUCKET?.trim(),
    process.env.ALYSON_HR_S3_BUCKET?.trim(),
    process.env.TIME_DOCTOR_TOKENS_S3_BUCKET?.trim(),
    "alyson-hr-orgchart",
    "alyson-hr-dummy-datas",
  ].filter((b): b is string => Boolean(b));
  return [...new Set(names)];
}

export function s3BucketCostTagSet(): Array<{ Key: string; Value: string }> {
  return [
    { Key: "Product", Value: PRODUCT },
    { Key: "Environment", Value: s3CostEnvironment() },
    { Key: "ManagedBy", Value: MANAGED_BY },
  ];
}
