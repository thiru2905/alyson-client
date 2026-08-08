import { useMemo } from "react";

type TranscriptTurn = {
  speaker: string;
  text: string;
};

type MeetingTranscriptViewProps = {
  text: string;
  className?: string;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Parse `Name: message` transcript lines into speaker turns (merge consecutive same speaker). */
export function parseTranscriptTurns(raw: string): TranscriptTurn[] {
  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd());

  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.text += "\n";
      continue;
    }

    // "Speaker Name: utterance" — require a plausible name (not a URL scheme).
    const match = trimmed.match(/^([^:]{1,80}?):\s+(.+)$/);
    if (match) {
      const speaker = match[1]!.trim();
      const text = match[2]!.trim();
      const looksLikeSpeaker =
        Boolean(speaker && text) &&
        /[A-Za-z]/.test(speaker) &&
        !/^https?$/i.test(speaker) &&
        speaker.length <= 60 &&
        // Avoid "12:30 lunch" style time prefixes (digits-only left side).
        !/^\d{1,2}$/.test(speaker);

      if (looksLikeSpeaker) {
        if (current && current.speaker.toLowerCase() === speaker.toLowerCase()) {
          current.text = `${current.text}\n${text}`.trim();
        } else {
          current = { speaker, text };
          turns.push(current);
        }
        continue;
      }
    }

    // Continuation / unstructured line — attach to previous turn or create Unknown.
    if (current) {
      current.text = `${current.text}\n${trimmed}`.trim();
    } else {
      current = { speaker: "Speaker", text: trimmed };
      turns.push(current);
    }
  }

  return turns
    .map((t) => ({ speaker: t.speaker, text: t.text.trim() }))
    .filter((t) => t.text.length > 0);
}

/** Polished transcript view: speaker chips + readable turns (matches notes-quality UI). */
export function MeetingTranscriptView({ text, className = "" }: MeetingTranscriptViewProps) {
  const turns = useMemo(() => parseTranscriptTurns(text), [text]);

  if (!turns.length) {
    return (
      <p className="text-sm text-muted-foreground">No transcript lines to display.</p>
    );
  }

  return (
    <div className={"space-y-1 " + className}>
      <div className="mb-3 text-[11px] text-muted-foreground">
        {turns.length} turn{turns.length === 1 ? "" : "s"}
      </div>
      <div className="divide-y divide-border/70">
        {turns.map((turn, i) => (
          <div key={`${turn.speaker}-${i}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold tracking-wide text-foreground">
                {initialsFromName(turn.speaker)}
              </div>
              <div className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
                {turn.speaker}
              </div>
            </div>
            <div className="mt-1.5 pl-9 text-[13.5px] leading-[1.65] whitespace-pre-wrap text-foreground/85">
              {turn.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
