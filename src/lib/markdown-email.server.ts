function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove LLM-style markdown code fences so notes render as normal email content. */
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

function renderEmailCodeBlock(code: string): string {
  return `<pre style="margin:12px 0;padding:12px 14px;background:#f4f4f5;border:1px solid #e5e7eb;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.5;color:#1f2937;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;">${escHtml(code)}</pre>`;
}

function inlineMarkdown(text: string): string {
  return escHtml(text)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, label, url) => {
        const u = String(url).trim();
        if (!/^https?:\/\//i.test(u) && !/^mailto:/i.test(u)) {
          return `[${label}](${escHtml(u)})`;
        }
        return `<a href="${escHtml(u)}" style="color:#4f46e5;text-decoration:underline;">${label}</a>`;
      },
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong style=\"color:#111827;\">$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f4f4f5;padding:1px 5px;border-radius:3px;font-size:12px;font-family:ui-monospace,monospace;color:#1f2937;">$1</code>',
    );
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const cells = trimmed.split("|").map((c) => c.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && parseTableCells(trimmed).length >= 2;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return trimmed
    .replace(/\|/g, "")
    .replace(/:/g, "")
    .replace(/\s/g, "")
    .split("")
    .every((ch) => ch === "-");
}

function renderEmailTable(header: string[], rows: string[][]): string {
  const colCount = Math.max(header.length, ...rows.map((r) => r.length));
  const normalizedHeader = Array.from({ length: colCount }, (_, i) => header[i] ?? "");
  const normalizedRows = rows.map((row) => Array.from({ length: colCount }, (_, i) => row[i] ?? ""));

  const th = normalizedHeader
    .map(
      (cell) =>
        `<th style="background:#f3f4f6;border:1px solid #e5e7eb;padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${inlineMarkdown(cell)}</th>`,
    )
    .join("");

  const body = normalizedRows
    .map((row, rowIdx) => {
      const bg = rowIdx % 2 === 1 ? "background:#fafafa;" : "background:#ffffff;";
      const tds = row
        .map(
          (cell) =>
            `<td style="border:1px solid #e5e7eb;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.55;color:#374151;${bg}">${inlineMarkdown(cell)}</td>`,
        )
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `
<div style="margin:14px 0 18px;overflow-x:auto;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;min-width:320px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <thead><tr>${th}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</div>`.trim();
}

/** Convert common meeting-notes markdown into email-safe HTML (no attachments). */
export function markdownToEmailHtml(md: string): string {
  const lines = normalizeMeetingNotesMarkdown(md).split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let i = 0;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      i++;
      continue;
    }

    const fenceOpen = trimmed.match(/^```([\w-]*)\s*$/);
    if (fenceOpen) {
      closeLists();
      const lang = (fenceOpen[1] ?? "").toLowerCase();
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const closeLine = (lines[i] ?? "").trim();
        if (closeLine === "```" || closeLine === "~~~") break;
        bodyLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;

      const inner = bodyLines.join("\n").trim();
      if (!inner) continue;
      if (!lang || lang === "markdown" || lang === "md") {
        out.push(markdownToEmailHtml(inner));
      } else {
        out.push(renderEmailCodeBlock(inner));
      }
      continue;
    }

    if (trimmed === "```" || /^```(?:markdown|md)?$/i.test(trimmed)) {
      i++;
      continue;
    }

    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1]?.trim() ?? "")) {
      closeLists();
      const header = parseTableCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = (lines[i] ?? "").trim();
        if (!rowLine) break;
        if (!isTableRow(rowLine) || isTableSeparator(rowLine)) break;
        rows.push(parseTableCells(rowLine));
        i++;
      }
      out.push(renderEmailTable(header, rows));
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1]!.length;
      const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      const size = level === 1 ? "17px" : level === 2 ? "15px" : "14px";
      out.push(
        `<${tag} style="margin:18px 0 8px;font-size:${size};font-weight:600;color:#111827;line-height:1.35;">${inlineMarkdown(heading[2]!)}</${tag}>`,
      );
      i++;
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul style="margin:8px 0 12px;padding-left:20px;color:#374151;">');
        inUl = true;
      }
      out.push(`<li style="margin:4px 0;line-height:1.55;">${inlineMarkdown(bullet[1]!)}</li>`);
      i++;
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol style="margin:8px 0 12px;padding-left:20px;color:#374151;">');
        inOl = true;
      }
      out.push(`<li style="margin:4px 0;line-height:1.55;">${inlineMarkdown(numbered[1]!)}</li>`);
      i++;
      continue;
    }

    closeLists();
    out.push(`<p style="margin:0 0 12px;line-height:1.6;color:#374151;">${inlineMarkdown(trimmed)}</p>`);
    i++;
  }

  closeLists();
  return out.join("\n");
}

export function markdownToPlainEmailText(md: string): string {
  const lines = normalizeMeetingNotesMarkdown(md).split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const t = (lines[i] ?? "").trimEnd();
    const trimmed = t.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^```(?:markdown|md)?\s*$/i.test(trimmed) || trimmed === "```") {
      i++;
      continue;
    }

    const fenceOpen = trimmed.match(/^```([\w-]*)\s*$/);
    if (fenceOpen) {
      const lang = (fenceOpen[1] ?? "").toLowerCase();
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const closeLine = (lines[i] ?? "").trim();
        if (closeLine === "```" || closeLine === "~~~") break;
        bodyLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;

      const inner = bodyLines.join("\n").trim();
      if (inner) {
        if (!lang || lang === "markdown" || lang === "md") {
          out.push(markdownToPlainEmailText(inner));
        } else {
          out.push(inner);
        }
      }
      continue;
    }

    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1]?.trim() ?? "")) {
      const header = parseTableCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = (lines[i] ?? "").trim();
        if (!rowLine || !isTableRow(rowLine) || isTableSeparator(rowLine)) break;
        rows.push(parseTableCells(rowLine));
        i++;
      }
      out.push("");
      out.push(header.join(" | ").toUpperCase());
      out.push(header.map(() => "---").join(" | "));
      for (const row of rows) {
        out.push(
          row
            .map((cell, idx) => {
              const plain = cell
                .replace(/\*\*(.+?)\*\*/g, "$1")
                .replace(/\*(.+?)\*/g, "$1")
                .replace(/`([^`]+)`/g, "$1")
                .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
              const label = header[idx] ?? `Col ${idx + 1}`;
              return `${label}: ${plain}`;
            })
            .join(" — "),
        );
      }
      out.push("");
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      out.push(trimmed.replace(/^#{1,6}\s+/, "").trim().toUpperCase());
    } else if (/^[-*]\s+/.test(trimmed)) {
      out.push(`• ${trimmed.replace(/^[-*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1")}`);
    } else if (isTableSeparator(trimmed)) {
      // skip orphan separators
    } else {
      out.push(
        trimmed
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
      );
    }
    i++;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function wrapMeetingNotesEmailHtml(args: {
  title: string;
  meetingDateLabel?: string;
  bodyHtml: string;
  appUrl?: string;
}): string {
  const title = escHtml(args.title);
  const dateLine = args.meetingDateLabel
    ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${escHtml(args.meetingDateLabel)}</p>`
    : "";

  const footerLink = args.appUrl
    ? `<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
        <a href="${escHtml(args.appUrl)}" style="color:#4f46e5;text-decoration:none;">View in Alyson Notetaker</a>
      </p>`
    : "";

  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f9fafb;padding:24px 12px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #f3f4f6;background:#fafafa;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:600;">Alyson Notetaker</div>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">${title}</h1>
      ${dateLine}
      <p style="margin:12px 0 0;font-size:13px;color:#4b5563;">Hi team — here are the notes from this meeting.</p>
    </div>
    <div style="padding:20px 24px 24px;">
      ${args.bodyHtml}
      ${footerLink}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;">
      Sent by Alyson Notetaker · Cintara
    </div>
  </div>
</div>`.trim();
}
