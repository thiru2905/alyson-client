/** Shared meeting-notes markdown helpers (safe for client + server). */

const KNOWN_SECTIONS =
  /^(summary|decisions|action\s*items|risks?\s*\/?\s*blockers?|open\s*questions)$/i;

/** Match bold owner labels like `**Fawad Waheed**:` */
const OWNER_ITEM_SPLIT = /(?=\*\*[^*]+\*\*\s*:)/;

/** Strip LLM code fences wrapping notes. */
export function normalizeMeetingNotesMarkdown(md: string): string {
  let text = String(md || "").replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  let changed = true;
  while (changed) {
    changed = false;
    const wrapped = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
    if (wrapped) {
      text = wrapped[1]!.trim();
      changed = true;
      continue;
    }
  }

  text = text.replace(/^```(?:markdown|md)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");

  return text
    .split("\n")
    .filter((line) => !/^```(?:markdown|md)?\s*$/i.test(line.trim()) && line.trim() !== "```")
    .join("\n")
    .trim();
}

/** Split a line/paragraph that packs multiple `**Name**: task` items onto separate bullets. */
function expandPackedOwnerItems(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const asBullet = trimmed.match(/^[-*]\s+(.+)$/);
  const body = asBullet ? asBullet[1]!.trim() : trimmed;

  const parts = body
    .split(OWNER_ITEM_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    if (/^\*\*[^*]+\*\*\s*:/.test(body)) return [`- ${body}`];
    return [asBullet ? trimmed : line.replace(/\t/g, "  ")];
  }

  return parts.map((p) => `- ${p.replace(/^[-*]\s+/, "")}`);
}

/**
 * Promote common meeting-note section bullets (`- Summary`) to headings
 * so they render as clear section titles in the UI.
 * Also splits packed action-item paragraphs onto separate lines.
 */
export function prepareMeetingNotesForDisplay(md: string): string {
  const lines = normalizeMeetingNotesMarkdown(md).split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      const title = bullet[1]!.trim().replace(/:$/, "");
      if (KNOWN_SECTIONS.test(title)) {
        if (out.length && out[out.length - 1] !== "") out.push("");
        out.push(`## ${title}`);
        continue;
      }
      out.push(...expandPackedOwnerItems(trimmed));
      continue;
    }

    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const title = heading[1]!.trim().replace(/:$/, "");
      if (KNOWN_SECTIONS.test(title)) {
        if (out.length && out[out.length - 1] !== "") out.push("");
        out.push(`## ${title}`);
        continue;
      }
    }

    if (!trimmed) {
      out.push("");
      continue;
    }

    // Plain paragraph that packs several **Name**: items → one bullet per owner.
    if ((trimmed.match(/\*\*[^*]+\*\*\s*:/g) || []).length > 1) {
      out.push(...expandPackedOwnerItems(trimmed));
      continue;
    }

    if (/^\*\*[^*]+\*\*\s*:/.test(trimmed)) {
      out.push(`- ${trimmed}`);
      continue;
    }

    out.push(raw.replace(/\t/g, "  "));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
