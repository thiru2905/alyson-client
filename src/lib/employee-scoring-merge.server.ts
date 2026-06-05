import type { EmployeeScoreInput } from "@/lib/employee-scoring-rules";
import { resolveCanonicalEmail, type SpeakerIdentityIndex } from "@/lib/speaker-identity";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

/** Sum metrics for the same person across multiple mailbox / Time Doctor accounts. */
export function mergeEmployeeScoreInputsByIdentity(
  inputs: EmployeeScoreInput[],
  index: SpeakerIdentityIndex,
): { inputs: EmployeeScoreInput[]; mergedAccountCount: number } {
  if (!inputs.length) return { inputs: [], mergedAccountCount: 0 };

  type Draft = EmployeeScoreInput & { linkedEmails: string[] };
  const groups = new Map<string, Draft>();
  let mergedAccountCount = 0;

  for (const row of inputs) {
    const canonicalEmail = resolveCanonicalEmail(row.userEmail, index) || normalizeEmail(row.userEmail);
    const existing = groups.get(canonicalEmail);
    if (!existing) {
      groups.set(canonicalEmail, {
        ...row,
        userEmail: canonicalEmail,
        linkedEmails: [normalizeEmail(row.userEmail)],
      });
      continue;
    }

    existing.emailsSent += row.emailsSent;
    existing.meetingsCreated += row.meetingsCreated;
    existing.docsCreated += row.docsCreated;
    existing.chatMessagesSent += row.chatMessagesSent;
    existing.workSeconds += row.workSeconds;
    const linked = normalizeEmail(row.userEmail);
    if (!existing.linkedEmails.includes(linked)) existing.linkedEmails.push(linked);
    if (row.displayName.trim().length > existing.displayName.trim().length) {
      existing.displayName = row.displayName;
    }
  }

  const merged = Array.from(groups.values()).map(({ linkedEmails, ...row }) => {
    const uniqueLinked = [...new Set(linkedEmails)].sort();
    if (uniqueLinked.length > 1) mergedAccountCount += uniqueLinked.length - 1;
    return {
      ...row,
      linkedEmails: uniqueLinked.length > 1 ? uniqueLinked : undefined,
    };
  });

  return { inputs: merged, mergedAccountCount };
}
