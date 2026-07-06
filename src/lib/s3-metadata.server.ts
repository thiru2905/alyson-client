/**
 * S3 user-defined metadata for PutObjectCommand.
 * Keys must NOT include the `x-amz-meta-` prefix — the AWS SDK adds it automatically.
 * Values must be HTTP-header safe (US-ASCII; no control chars or newlines).
 */

const META_PREFIX = /^x-amz-meta-/i;

/** Strip accidental `x-amz-meta-` prefix and normalize key casing for S3. */
export function normalizeS3MetadataKey(key: string): string {
  return String(key || "")
    .trim()
    .replace(META_PREFIX, "")
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ENCODED_PREFIX = "u:";

/** Sanitize a metadata value for S3 / HTTP headers. */
export function sanitizeS3MetadataValue(value: unknown, maxLen = 1024): string {
  let s = String(value ?? "").trim();
  if (!s) return "unknown";

  // Control chars and line breaks break header encoding.
  s = s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "unknown";

  // S3 user metadata values should be US-ASCII; encode Unicode safely.
  if (/[^\x20-\x7E]/.test(s)) {
    s = `${ENCODED_PREFIX}${encodeURIComponent(s.slice(0, 500))}`;
  }

  return s.slice(0, maxLen);
}

/** Build Metadata map for PutObjectCommand from arbitrary key/value input. */
export function buildS3Metadata(entries: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(entries)) {
    const key = normalizeS3MetadataKey(rawKey);
    if (!key) continue;
    out[key] = sanitizeS3MetadataValue(rawVal);
  }
  return out;
}

/** Read metadata from HeadObject/GetObject (handles legacy double-prefix keys on read). */
export function readS3MetadataValue(
  metadata: Record<string, string> | undefined,
  key: string,
): string {
  if (!metadata) return "";
  const norm = normalizeS3MetadataKey(key);
  const candidates = [
    key,
    norm,
    `x-amz-meta-${norm}`,
    `x-amz-meta-x-amz-meta-${norm}`,
  ];
  for (const k of candidates) {
    const v = metadata[k] ?? metadata[k.toLowerCase()];
    if (v != null && String(v).trim()) return decodeS3MetadataValue(String(v));
  }
  return "";
}

export function decodeS3MetadataValue(value: string): string {
  const s = String(value || "").trim();
  if (s.startsWith(ENCODED_PREFIX)) {
    try {
      return decodeURIComponent(s.slice(ENCODED_PREFIX.length));
    } catch {
      return s;
    }
  }
  return s;
}
