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

function pickBestDisplayName(candidates: string[]): string {
  const cleaned = candidates.map((s) => s.trim()).filter(Boolean);
  if (!cleaned.length) return "";
  return cleaned.sort((a, b) => {
    const aWords = a.split(/\s+/).filter(Boolean).length;
    const bWords = b.split(/\s+/).filter(Boolean).length;
    if (bWords !== aWords) return bWords - aWords;
    return b.length - a.length;
  })[0]!;
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

  let out = text;
  out = out.replace(new RegExp(`\\*\\*${escaped}\\*\\*`, "gi"), `**${fullName}**`);
  out = out.replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, "gi"), `(${fullName})`);
  out = out.replace(
    new RegExp(`(^|[\\n\\r]|[-*]\\s+)${escaped}\\s*:`, "gim"),
    `$1${fullName}:`,
  );
  out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), fullName);
  return out;
}

/** Expand initials / short names (TN, MY) to full participant names in meeting notes markdown. */
export function expandParticipantNamesInMeetingNotes(
  notesMd: string,
  participantNames: string[],
): string {
  const fullNames = [...new Set(participantNames.map((n) => n.trim()).filter(Boolean))];
  if (!fullNames.length) return notesMd;

  const aliases = buildUnambiguousAliases(fullNames);
  const sorted = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);

  let text = notesMd;
  for (const [alias, fullName] of sorted) {
    if (normalizePersonName(alias) === normalizePersonName(fullName)) continue;
    text = replaceAliasInText(text, alias, fullName);
  }

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
