import { subDays, subMonths } from "date-fns";
import type { EmployeePickerEntry } from "@/lib/employee-picker-types";
import type { AlysonBrainRange, AlysonBrainResolvedEmployee } from "@/lib/alyson-brain/alyson-brain-types";

const TOPIC_WORDS =
  /^(leaves?|bonus|bonuses|pacing|meetings?|tasks?|projects?|performance|scoring|workspace|hours?|attendance|payroll|equity)$/i;

function normalize(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNameMatch(query: string, entry: EmployeePickerEntry): number {
  const q = normalize(query);
  const name = normalize(entry.name);
  const local = normalize(entry.email.split("@")[0] || "");
  const first = name.split(" ")[0] || "";
  if (!q || q.length < 2) return 0;
  if (name === q || local === q) return 100;
  if (first === q || local === q) return 98;
  if (name.startsWith(q) || local.startsWith(q) || first.startsWith(q)) return 90;
  if (first.includes(q) && q.length >= 3) return 85;
  if (name.includes(q) || local.includes(q)) return 75;
  const parts = q.split(" ").filter(Boolean);
  if (parts.length > 1 && parts.every((p) => name.includes(p))) return 80;
  if (parts.length === 1 && parts[0]!.length >= 3 && name.includes(parts[0]!)) return 65;
  return 0;
}

/** Strip topic lists after em-dash: "Thiru — leaves, bonus and meetings" → "Thiru" */
function stripTopicTail(text: string) {
  return text
    .replace(/\s*[—–-]\s+[\s\S]+$/i, "")
    .replace(/\s+(?:including|with|covering)\s+[\s\S]+$/i, "")
    .trim();
}

export function parseEmployeeNamesFromQuestion(question: string): string[] {
  const q = question.trim();
  const base = stripTopicTail(q);

  const afterCue =
    base.match(
      /(?:report|summary|details|overview|analysis|insights?)\s+(?:on|for|about)\s+(.+?)(?:\s+for\s+(?:the\s+)?(?:past|last)\s+|$)/i,
    )?.[1]?.trim() ??
    base.match(/(?:on|for|about)\s+(.+?)(?:\s+for\s+(?:the\s+)?(?:past|last)\s+|$)/i)?.[1]?.trim();

  let raw = stripTopicTail((afterCue ?? base).trim());
  raw = raw
    .replace(/\b(?:past|last)\s+\d+\s*(?:day|days|week|weeks|month|months)\b/gi, "")
    .replace(/\b(?:please|give me|show me|get|fetch|a|an|the)\b/gi, "")
    .replace(/\b(?:report|summary|details|overview)\b/gi, "")
    .trim();

  const chunks: string[] = [];

  const andMatch = raw.match(/^(.+?)\s+and\s+(.+)$/i);
  if (andMatch) {
    const left = andMatch[1]!.trim();
    const right = andMatch[2]!.trim();
    if (!TOPIC_WORDS.test(right) && !TOPIC_WORDS.test(left)) {
      chunks.push(left, right);
    }
  }

  if (!chunks.length) {
    for (const part of raw.split(/\s*(?:\/|,)\s*/)) {
      const t = part.trim();
      if (t.length >= 2 && !TOPIC_WORDS.test(t)) chunks.push(t);
    }
  }

  if (!chunks.length && raw.length >= 2 && !TOPIC_WORDS.test(raw)) {
    chunks.push(raw);
  }

  const unique = new Map<string, string>();
  for (const c of chunks) {
    const key = normalize(c);
    if (!key || key.length < 2) continue;
    if (!unique.has(key)) unique.set(key, c);
  }
  return Array.from(unique.values()).slice(0, 5);
}

export function parseRangeFromQuestion(question: string, now = new Date()): AlysonBrainRange {
  const q = question.toLowerCase();
  const endIso = now.toISOString();

  const months = q.match(/(?:past|last)\s+(\d+)\s*months?/);
  if (months) {
    const n = Math.min(Math.max(Number(months[1]) || 3, 1), 24);
    const start = subMonths(now, n);
    return { startIso: start.toISOString(), endIso, label: `Past ${n} month${n === 1 ? "" : "s"}` };
  }

  const weeks = q.match(/(?:past|last)\s+(\d+)\s*weeks?/);
  if (weeks) {
    const n = Math.min(Math.max(Number(weeks[1]) || 4, 1), 52);
    const start = subDays(now, n * 7);
    return { startIso: start.toISOString(), endIso, label: `Past ${n} week${n === 1 ? "" : "s"}` };
  }

  const days = q.match(/(?:past|last)\s+(\d+)\s*days?/);
  if (days) {
    const n = Math.min(Math.max(Number(days[1]) || 30, 1), 366);
    const start = subDays(now, n);
    return { startIso: start.toISOString(), endIso, label: `Past ${n} day${n === 1 ? "" : "s"}` };
  }

  const start = subMonths(now, 3);
  return { startIso: start.toISOString(), endIso, label: "Past 3 months" };
}

export function resolveEmployeesFromNames(
  names: string[],
  directory: EmployeePickerEntry[],
): AlysonBrainResolvedEmployee[] {
  const resolved: AlysonBrainResolvedEmployee[] = [];

  for (const queryName of names) {
    const scored = directory
      .map((e) => ({ e, score: scoreNameMatch(queryName, e) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      resolved.push({
        queryName,
        email: "",
        displayName: queryName,
        matchConfidence: "partial",
        alternatives: directory
          .map((e) => ({ e, score: scoreNameMatch(queryName.slice(0, 3), e) }))
          .filter((x) => x.score > 0)
          .slice(0, 3)
          .map((x) => `${x.e.name} <${x.e.email}>`),
      });
      continue;
    }

    const top = scored[0]!;
    const alts = scored.slice(1, 4).map((x) => `${x.e.name} <${x.e.email}>`);
    resolved.push({
      queryName,
      email: top.e.email,
      displayName: top.e.name,
      matchConfidence:
        top.score >= 88
          ? "exact"
          : scored.length > 1 && scored[1]!.score >= top.score - 8
            ? "ambiguous"
            : "partial",
      alternatives: alts.length ? alts : undefined,
    });
  }

  return resolved;
}
