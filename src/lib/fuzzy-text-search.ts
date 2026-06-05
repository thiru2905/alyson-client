/** Lowercase, strip accents, collapse punctuation to spaces for consistent matching. */
export function normalizeSearchText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Same as normalizeSearchText but with all spaces removed — matches "data engineering" to "data-engineering". */
export function normalizeSearchCompact(text: string): string {
  return normalizeSearchText(text).replace(/\s+/g, "");
}

function searchTokens(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/**
 * Fuzzy, case-insensitive match: "data engineering" hits "Data-Engineering Sync",
 * "dataengineering weekly", and "Data Engineering".
 */
export function textMatchesSearchQuery(haystack: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;

  const normalized = normalizeSearchText(haystack);
  const compactHay = normalizeSearchCompact(haystack);
  const compactQuery = normalizeSearchCompact(query);

  if (normalized.includes(q)) return true;
  if (compactQuery.length >= 2 && compactHay.includes(compactQuery)) return true;

  const tokens = searchTokens(query);
  if (tokens.length <= 1) return false;

  return tokens.every(
    (token) => normalized.includes(token) || compactHay.includes(token.replace(/\s+/g, "")),
  );
}

export function dateMatchesSearchQuery(day: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return day.toLowerCase().includes(q);
}
