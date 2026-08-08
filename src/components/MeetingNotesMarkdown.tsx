import { Fragment, type ReactNode } from "react";
import { prepareMeetingNotesForDisplay } from "@/lib/meeting-notes-markdown";

type MeetingNotesMarkdownProps = {
  markdown: string;
  className?: string;
};

type Block =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" };

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    }
    const token = match[0]!;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key++} className="italic text-foreground/90">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[12px]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={key++}
            href={link[2]}
            className="text-foreground underline underline-offset-2 hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(<Fragment key={key++}>{token}</Fragment>);
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }
  return nodes;
}

function parseBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;

    // If any line is an owner action item, keep each on its own bullet — never glue them.
    const ownerLines = buf.filter((l) => /^\*\*[^*]+\*\*\s*:/.test(l.trim()));
    if (ownerLines.length > 0 && ownerLines.length === buf.length) {
      blocks.push({
        type: "ul",
        items: buf.map((l) => l.trim()),
      });
      buf.length = 0;
      return;
    }

    // Packed single string with multiple owners → split into bullets.
    const joined = buf.join(" ").replace(/\s+/g, " ").trim();
    const ownerCount = (joined.match(/\*\*[^*]+\*\*\s*:/g) || []).length;
    if (ownerCount > 1) {
      const parts = joined
        .split(/(?=\*\*[^*]+\*\*\s*:)/)
        .map((p) => p.trim())
        .filter(Boolean);
      blocks.push({ type: "ul", items: parts });
      buf.length = 0;
      return;
    }

    if (joined) blocks.push({ type: "p", text: joined });
    buf.length = 0;
  };

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
      blocks.push({ type: "h", level, text: heading[2]!.trim() });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        const m = t.match(/^[-*]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!.trim());
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Owner action lines without a leading dash.
    if (/^\*\*[^*]+\*\*\s*:/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        if (!/^\*\*[^*]+\*\*\s*:/.test(t)) break;
        items.push(t);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        const m = t.match(/^\d+\.\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!.trim());
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const t = (lines[i] ?? "").trim();
      if (!t) break;
      if (
        /^(#{1,3})\s+/.test(t) ||
        /^[-*]\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^---+$/.test(t) ||
        /^\*\*[^*]+\*\*\s*:/.test(t)
      ) {
        break;
      }
      para.push(t);
      i++;
    }
    flushParagraph(para);
  }

  return blocks;
}

/** Lightweight meeting-notes markdown renderer (no heavy deps — faster route loads). */
export function MeetingNotesMarkdown({ markdown, className = "" }: MeetingNotesMarkdownProps) {
  const source = prepareMeetingNotesForDisplay(markdown);
  if (!source) return null;
  const blocks = parseBlocks(source);

  return (
    <div className={"meeting-notes-md text-[13.5px] leading-relaxed text-foreground/90 " + className}>
      {blocks.map((block, idx) => {
        if (block.type === "hr") {
          return <hr key={idx} className="my-5 border-border" />;
        }
        if (block.type === "h") {
          if (block.level === 1) {
            return (
              <h2
                key={idx}
                className="mt-0 mb-3 text-[15px] font-semibold tracking-tight text-foreground first:mt-0"
              >
                {renderInline(block.text)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h2
                key={idx}
                className="mt-6 mb-2 border-b border-border/70 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground first:mt-0"
              >
                {renderInline(block.text)}
              </h2>
            );
          }
          return (
            <h3 key={idx} className="mt-4 mb-1.5 text-[13px] font-semibold text-foreground first:mt-0">
              {renderInline(block.text)}
            </h3>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={idx} className="mb-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.6] last:mb-0">
              {block.items.map((item, j) => (
                <li key={j} className="pl-0.5 marker:text-muted-foreground/80">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={idx} className="mb-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-[1.6] last:mb-0">
              {block.items.map((item, j) => (
                <li key={j} className="pl-0.5 marker:text-muted-foreground/80">
                  {renderInline(item)}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="mb-3 text-[13.5px] leading-[1.65] text-foreground/85 last:mb-0">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
