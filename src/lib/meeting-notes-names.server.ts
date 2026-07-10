import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import type { MeetingParticipant } from "@/lib/notetaker-meeting-participants.server";
import {
  normalizePersonName,
  resolveCanonicalSpeaker,
  resolveRosterPersonEmail,
} from "@/lib/speaker-identity";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameParts(name: string): string[] {
  return normalizePersonName(name).split(" ").filter(Boolean);
}

function firstLastInitials(name: string): string {
  const parts = nameParts(name);
  if (parts.length < 2) return "";
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

/** Strip job-title tails from directory names (e.g. "Ameer Hamza Data Engineer" → "Ameer Hamza"). */
function stripJobTitleSuffix(name: string): string {
  const TITLE_TOKENS = new Set([
    "data",
    "engineer",
    "engineering",
    "manager",
    "lead",
    "senior",
    "junior",
    "architect",
    "designer",
    "developer",
    "analyst",
    "intern",
    "ops",
    "operations",
    "product",
    "director",
    "head",
    "chief",
    "officer",
    "associate",
    "consultant",
    "specialist",
  ]);
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");

  let end = parts.length;
  while (end > 2 && TITLE_TOKENS.has(parts[end - 1]!.toLowerCase())) {
    end -= 1;
  }
  // Keep at least first + last personal tokens.
  return parts.slice(0, Math.max(2, end)).join(" ");
}

function pickBestDisplayName(candidates: string[]): string {
  const cleaned = [
    ...new Set(
      candidates
        .map((s) => stripJobTitleSuffix(s.trim()))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (!cleaned.length) return "";

  // Drop title-polluted extensions when a shorter real name exists
  // e.g. prefer "Ameer Hamza" over "Ameer Hamza Data Engineer".
  const withoutTitleExtensions = cleaned.filter((c) => {
    const cNorm = normalizePersonName(c);
    return !cleaned.some((other) => {
      if (other === c) return false;
      const oNorm = normalizePersonName(other);
      const oWords = oNorm.split(" ").filter(Boolean).length;
      return oWords >= 2 && cNorm.startsWith(`${oNorm} `);
    });
  });
  const pool = withoutTitleExtensions.length ? withoutTitleExtensions : cleaned;

  return pool.sort((a, b) => {
    const aWords = a.split(/\s+/).filter(Boolean).length;
    const bWords = b.split(/\s+/).filter(Boolean).length;
    if (bWords !== aWords) return bWords - aWords;
    return b.length - a.length;
  })[0]!;
}

/** True when `matched` at `index` is already the start of `fullName` in the text. */
function isAlreadyExpandedNamePrefix(
  text: string,
  index: number,
  matched: string,
  fullName: string,
): boolean {
  const matchedNorm = normalizePersonName(matched);
  const fullNorm = normalizePersonName(fullName);
  if (!matchedNorm || !fullNorm) return false;
  if (matchedNorm === fullNorm) return true;
  if (!fullNorm.startsWith(`${matchedNorm} `) && !fullNorm.startsWith(matchedNorm)) {
    return false;
  }

  const remaining = fullNorm.slice(matchedNorm.length).trim();
  if (!remaining) return true;

  const after = text.slice(index + matched.length);
  const nextWord = after.match(/^\s+(\S+)/)?.[1];
  if (!nextWord) return false;

  const remFirst = remaining.split(/\s+/).filter(Boolean)[0];
  return Boolean(remFirst && normalizePersonName(nextWord) === remFirst);
}

/** Resolve transcript/calendar labels to full display names (prefer roster / directory). */
export async function resolveMeetingParticipantDisplayNames(args: {
  participants: MeetingParticipant[];
}): Promise<string[]> {
  const [{ index }, directory] = await Promise.all([
    getSpeakerIdentityIndex(),
    loadEmployeePickerDirectory(),
  ]);

  const byNorm = new Map<string, string>();

  const addLabel = (label: string) => {
    const raw = String(label || "").trim();
    if (!raw) return;

    const resolved = resolveRosterPersonEmail(raw, index, directory.employees);
    let name = resolved.name || resolveCanonicalSpeaker(raw, index);
    if (!name || name === "Speaker" || name === "Unknown") return;

    const rosterMatch = directory.employees.find((e) => {
      const eNorm = normalizePersonName(e.name);
      const nNorm = normalizePersonName(name);
      return (
        eNorm === nNorm ||
        eNorm.startsWith(`${nNorm} `) ||
        nNorm.startsWith(`${eNorm.split(" ")[0] ?? ""} `)
      );
    });
    if (rosterMatch?.name.trim()) {
      name = pickBestDisplayName([name, rosterMatch.name.trim()]);
    }

    const key = normalizePersonName(name);
    if (!key) return;
    const prev = byNorm.get(key);
    byNorm.set(key, pickBestDisplayName([prev ?? "", name]));
  };

  for (const p of args.participants) addLabel(p.name);

  return [...byNorm.values()].sort((a, b) => a.localeCompare(b));
}

function buildUnambiguousAliases(fullNames: string[]): Map<string, string> {
  const aliasToNames = new Map<string, Set<string>>();

  const register = (alias: string, fullName: string) => {
    const key = alias.trim();
    if (!key || key.length < 2) return;
    const set = aliasToNames.get(key) ?? new Set<string>();
    set.add(fullName);
    aliasToNames.set(key, set);
  };

  for (const fullName of fullNames) {
    const trimmed = fullName.trim();
    if (!trimmed) continue;
    const parts = nameParts(trimmed);
    register(trimmed, trimmed);
    register(trimmed.toLowerCase(), trimmed);

    if (parts.length >= 2) {
      const initials = firstLastInitials(trimmed);
      if (initials) {
        register(initials, trimmed);
        register(initials.toLowerCase(), trimmed);
      }
      const first = parts[0]!;
      if (first.length >= 3) register(first, trimmed);
    }
  }

  const out = new Map<string, string>();
  for (const [alias, names] of aliasToNames) {
    if (names.size === 1) out.set(alias, [...names][0]!);
  }
  return out;
}

function stripRedundantInitialsParenthetical(text: string, fullNames: string[]): string {
  let out = text;
  for (const fullName of fullNames) {
    const initials = firstLastInitials(fullName);
    if (!initials) continue;
    const escapedName = escapeRegExp(fullName);
    const escapedInitials = escapeRegExp(initials);
    out = out.replace(
      new RegExp(`${escapedName}\\s*\\(\\s*${escapedInitials}\\s*\\)`, "gi"),
      fullName,
    );
  }
  return out;
}

function replaceAliasInText(text: string, alias: string, fullName: string): string {
  if (!alias || alias.toLowerCase() === fullName.toLowerCase()) return text;
  const escaped = escapeRegExp(alias);

  const replaceMatch = (match: string, offset: number, source: string) => {
    if (isAlreadyExpandedNamePrefix(source, offset, match, fullName)) return match;
    return fullName;
  };

  let out = text;
  out = out.replace(new RegExp(`\\*\\*${escaped}\\*\\*`, "gi"), (match, offset, source) => {
    const inner = match.slice(2, -2);
    if (isAlreadyExpandedNamePrefix(source, offset + 2, inner, fullName)) return match;
    return `**${fullName}**`;
  });
  out = out.replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, "gi"), (match, offset, source) => {
    const inner = match.replace(/^\(\s*|\s*\)$/g, "");
    const innerOffset = offset + match.indexOf(inner);
    if (isAlreadyExpandedNamePrefix(source, innerOffset, inner, fullName)) return match;
    return `(${fullName})`;
  });
  out = out.replace(
    new RegExp(`(^|[\\n\\r]|[-*]\\s+)${escaped}\\s*:`, "gim"),
    (match, prefix: string, offset: number, source: string) => {
      const nameStart = offset + prefix.length;
      const nameMatch = match.slice(prefix.length).replace(/\s*:$/, "");
      if (isAlreadyExpandedNamePrefix(source, nameStart, nameMatch, fullName)) return match;
      return `${prefix}${fullName}:`;
    },
  );
  out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), replaceMatch);
  return out;
}

/** Collapse "Vinit Solanki Solanki" / "… Hamza Hamza" back to the canonical full name. */
function collapseDuplicatedNameTails(text: string, fullNames: string[]): string {
  let out = text;
  const sorted = [...fullNames].sort((a, b) => b.length - a.length);
  for (const fullName of sorted) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const last = parts[parts.length - 1]!;
    const escFull = escapeRegExp(fullName);
    const escLast = escapeRegExp(last);
    // Exact: "Vinit Solanki Solanki"
    out = out.replace(new RegExp(`(${escFull})(?:\\s+${escLast})+`, "gi"), "$1");
    // Title-polluted: "Ameer Hamza Data Engineer Hamza" → "Ameer Hamza"
    out = out.replace(
      new RegExp(
        `(${escFull})(?:\\s+(?:Data|Engineer|Engineering|Manager|Lead|Senior|Junior|Architect|Designer|Developer|Analyst|Intern|Ops|Operations|Product|Director|Head|Chief|Officer|Associate|Consultant|Specialist))+\\s+${escLast}\\b`,
        "gi",
      ),
      "$1",
    );
  }
  return out;
}

/** Expand initials / short names (TN, MY) to full participant names in meeting notes markdown. */
export function expandParticipantNamesInMeetingNotes(
  notesMd: string,
  participantNames: string[],
): string {
  const fullNames = [
    ...new Set(
      participantNames
        .map((n) => stripJobTitleSuffix(n.trim()))
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ];
  if (!fullNames.length) return notesMd;

  // Protect already-correct full names so first-name aliases cannot expand inside them.
  const placeholders: Array<{ token: string; value: string }> = [];
  let text = notesMd;
  const namesByLength = [...fullNames].sort((a, b) => b.length - a.length);
  for (let i = 0; i < namesByLength.length; i++) {
    const fullName = namesByLength[i]!;
    const token = `\u0000PN${i}\u0000`;
    const escaped = escapeRegExp(fullName);
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    text = text.replace(re, () => {
      placeholders.push({ token, value: fullName });
      return token;
    });
  }

  const aliases = buildUnambiguousAliases(fullNames);
  const sorted = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [alias, fullName] of sorted) {
    if (normalizePersonName(alias) === normalizePersonName(fullName)) continue;
    text = replaceAliasInText(text, alias, fullName);
  }

  for (const { token, value } of placeholders) {
    text = text.split(token).join(value);
  }

  text = collapseDuplicatedNameTails(text, fullNames);
  return stripRedundantInitialsParenthetical(text, fullNames);
}

/** Resolve a single owner label (e.g. TN) to the roster full name when unambiguous. */
export function resolveOwnerDisplayName(
  ownerLabel: string,
  participantNames: string[],
): string {
  const raw = String(ownerLabel || "").trim();
  if (!raw) return raw;

  const aliases = buildUnambiguousAliases(participantNames);
  const direct = aliases.get(raw) ?? aliases.get(raw.toLowerCase());
  if (direct) return direct;

  const norm = normalizePersonName(raw);
  for (const fullName of participantNames) {
    if (normalizePersonName(fullName) === norm) return fullName;
  }

  return raw;
}
