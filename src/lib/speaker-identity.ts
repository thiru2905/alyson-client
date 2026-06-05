/** Merge transcript speaker labels that belong to the same person (multiple emails / name variants). */

export type SpeakerIdentityEntry = {
  email: string;
  name: string;
};

export type SpeakerIdentityIndex = {
  aliasToCanonical: Map<string, string>;
  canonicalToAliases: Map<string, Set<string>>;
  emailToCanonicalEmail: Map<string, string>;
  localPartToCanonicalEmail: Map<string, string>;
  /** Extra directory accounts folded into an existing person (e.g. second email). */
  mergedAccountCount: number;
};

export const EMPTY_SPEAKER_IDENTITY_INDEX: SpeakerIdentityIndex = {
  aliasToCanonical: new Map(),
  canonicalToAliases: new Map(),
  emailToCanonicalEmail: new Map(),
  localPartToCanonicalEmail: new Map(),
  mergedAccountCount: 0,
};

export function normalizePersonName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emailLocalPart(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    ?.trim() ?? "";
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    let cur = i;
    while (this.parent[cur] !== cur) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function pickDisplayName(entries: SpeakerIdentityEntry[]): string {
  const names = entries.map((e) => e.name.trim()).filter(Boolean);
  if (names.length === 0) {
    const local = emailLocalPart(entries[0]?.email ?? "");
    if (!local) return "Unknown";
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return names.sort((a, b) => b.length - a.length || a.localeCompare(b))[0]!;
}

/** Prefer the primary org mailbox when someone has several directory emails. */
export function pickCanonicalEmail(entries: SpeakerIdentityEntry[]): string {
  const emails = entries.map((e) => e.email.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return "";
  const revcloud = emails.find((e) => e.endsWith("@revcloud.com"));
  if (revcloud) return revcloud;
  return emails.sort()[0]!;
}

function registerAlias(map: Map<string, string>, alias: string, canonical: string) {
  const key = alias.trim().toLowerCase();
  if (!key) return;
  map.set(key, canonical);
}

/** Group roster rows by shared full name or shared email local-part (e.g. mohita@revcloud + mohita@cintara). */
export function buildSpeakerIdentityIndex(entries: SpeakerIdentityEntry[]): SpeakerIdentityIndex {
  const roster = entries
    .map((e) => ({
      email: String(e.email || "").trim().toLowerCase(),
      name: String(e.name || "").trim(),
    }))
    .filter((e) => e.email || e.name);

  if (!roster.length) return EMPTY_SPEAKER_IDENTITY_INDEX;

  const uf = new UnionFind(roster.length);

  const byNormName = new Map<string, number[]>();
  for (let i = 0; i < roster.length; i++) {
    const norm = normalizePersonName(roster[i]!.name);
    if (!norm || norm.length < 2) continue;
    const group = byNormName.get(norm) ?? [];
    group.push(i);
    byNormName.set(norm, group);
  }
  for (const group of byNormName.values()) {
    for (let j = 1; j < group.length; j++) uf.union(group[0]!, group[j]!);
  }

  const byLocalPart = new Map<string, number[]>();
  for (let i = 0; i < roster.length; i++) {
    const local = emailLocalPart(roster[i]!.email);
    if (!local || local.length < 2) continue;
    const group = byLocalPart.get(local) ?? [];
    group.push(i);
    byLocalPart.set(local, group);
  }
  for (const group of byLocalPart.values()) {
    for (let j = 1; j < group.length; j++) uf.union(group[0]!, group[j]!);
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < roster.length; i++) {
    const root = uf.find(i);
    const group = clusters.get(root) ?? [];
    group.push(i);
    clusters.set(root, group);
  }

  const aliasToCanonical = new Map<string, string>();
  const canonicalToAliases = new Map<string, Set<string>>();
  const emailToCanonicalEmail = new Map<string, string>();
  const localPartToCanonicalEmail = new Map<string, string>();
  let mergedAccountCount = 0;

  for (const indices of clusters.values()) {
    if (indices.length > 1) mergedAccountCount += indices.length - 1;

    const clusterEntries = indices.map((i) => roster[i]!);
    const canonical = pickDisplayName(clusterEntries);
    const canonicalEmail = pickCanonicalEmail(clusterEntries);
    const aliases = new Set<string>();
    const clusterEmails: string[] = [];

    for (const entry of clusterEntries) {
      if (entry.email) {
        aliases.add(entry.email);
        clusterEmails.push(entry.email);
        if (canonicalEmail) emailToCanonicalEmail.set(entry.email, canonicalEmail);
      }
      const local = emailLocalPart(entry.email);
      if (local) aliases.add(local);
      if (entry.name) {
        aliases.add(entry.name.toLowerCase());
        const norm = normalizePersonName(entry.name);
        if (norm) aliases.add(norm);
        const first = norm.split(" ")[0];
        if (first && first.length >= 3) aliases.add(first);
      }
    }

    if (canonicalEmail && clusterEmails.length) {
      const localParts = [...new Set(clusterEmails.map(emailLocalPart).filter((lp) => lp.length >= 2))];
      if (localParts.length === 1) localPartToCanonicalEmail.set(localParts[0]!, canonicalEmail);
    }

    for (const alias of aliases) registerAlias(aliasToCanonical, alias, canonical);
    canonicalToAliases.set(canonical, aliases);
  }

  return {
    aliasToCanonical,
    canonicalToAliases,
    emailToCanonicalEmail,
    localPartToCanonicalEmail,
    mergedAccountCount,
  };
}

export function resolveCanonicalEmail(email: string, index: SpeakerIdentityIndex): string {
  const key = email.trim().toLowerCase();
  if (!key) return key;

  const direct = index.emailToCanonicalEmail.get(key);
  if (direct) return direct;

  const local = emailLocalPart(key);
  if (local) {
    const byLocal = index.localPartToCanonicalEmail.get(local);
    if (byLocal) return byLocal;
  }

  return key;
}

export function resolveCanonicalSpeaker(label: string, index: SpeakerIdentityIndex): string {
  const raw = String(label || "").trim();
  if (!raw) return "Speaker";
  if (!index.aliasToCanonical.size) return raw;

  const lower = raw.toLowerCase();
  const hit = index.aliasToCanonical.get(lower);
  if (hit) return hit;

  const norm = normalizePersonName(raw);
  if (norm) {
    const byNorm = index.aliasToCanonical.get(norm);
    if (byNorm) return byNorm;
    const first = norm.split(" ")[0];
    if (first && first.length >= 3) {
      const byFirst = index.aliasToCanonical.get(first);
      if (byFirst) return byFirst;
    }
  }

  if (looksLikeEmail(raw)) {
    const local = emailLocalPart(raw);
    const byLocal = index.aliasToCanonical.get(local);
    if (byLocal) return byLocal;
  }

  return raw;
}

export function speakerMatchesAnyFilterWithIdentity(
  speaker: string,
  filters: string[],
  index: SpeakerIdentityIndex,
): boolean {
  if (!filters.length) return true;

  const canonical = resolveCanonicalSpeaker(speaker, index).toLowerCase();
  const raw = speaker.toLowerCase();

  return filters.some((filter) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    const filterCanonical = resolveCanonicalSpeaker(filter, index).toLowerCase();
    return (
      raw.includes(f) ||
      canonical.includes(f) ||
      f.includes(canonical) ||
      filterCanonical.includes(f) ||
      f.includes(filterCanonical) ||
      canonical === filterCanonical
    );
  });
}

export function meetingHasMatchingSpeakerWithIdentity(
  speakers: Array<{ speaker: string }>,
  filters: string[],
  index: SpeakerIdentityIndex,
): boolean {
  if (!filters.length) return true;
  return speakers.some((s) => speakerMatchesAnyFilterWithIdentity(s.speaker, filters, index));
}
