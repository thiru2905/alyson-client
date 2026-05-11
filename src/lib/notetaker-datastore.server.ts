import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NotetakerSession, NotetakerTranscriptLine } from "@/lib/alyson-notetaker-functions";

export type PersistedNotetakerSession = {
  botId: string;
  title: string;
  meetingUrl?: string;
  botName?: string;
  createdAt: string;
  status?: string;

  finalizedAt: string;
  transcript: {
    format: "plain_text";
    transcriptText: string;
    lineCount: number;
    firstLineAt?: string;
    lastLineAt?: string;
  };
  notes?: {
    notesMd: string;
    model?: string;
    generatedAt: string;
  };
};

function dataDir() {
  // Keep this local and self-contained for dev. Can be swapped to DB/S3 later.
  return process.env.ALYSON_NOTETAKER_DATA_DIR || path.join(process.cwd(), ".alyson", "notetaker-db");
}

function sessionPath(botId: string) {
  return path.join(dataDir(), "sessions", `${botId}.json`);
}

async function ensureDirs() {
  await mkdir(path.join(dataDir(), "sessions"), { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, obj: unknown) {
  await ensureDirs();
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await rename(tmp, filePath);
}

export async function getPersistedSession(botId: string) {
  return await readJson<PersistedNotetakerSession>(sessionPath(botId));
}

export async function persistSession({
  session,
  lines,
  notes,
}: {
  session: NotetakerSession;
  lines: NotetakerTranscriptLine[];
  notes?: { notes: string; model?: string } | null;
}) {
  const existing = await getPersistedSession(session.botId);
  if (existing?.finalizedAt) return existing;

  const sorted = [...lines].sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  const transcriptText = sorted
    .map((L) => {
      const who = (L.participant?.name || "Speaker").trim();
      const text = String(L.text || "").trim();
      if (!text) return "";
      return `${who}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");

  const firstLineAt = sorted[0]?.received_at;
  const lastLineAt = sorted[sorted.length - 1]?.received_at;

  const persisted: PersistedNotetakerSession = {
    botId: session.botId,
    title: session.title,
    meetingUrl: session.meetingUrl,
    botName: session.botName,
    createdAt: session.createdAt,
    status: session.status,
    finalizedAt: new Date().toISOString(),
    transcript: {
      format: "plain_text",
      transcriptText,
      lineCount: sorted.length,
      firstLineAt,
      lastLineAt,
    },
    notes: notes?.notes
      ? {
          notesMd: String(notes.notes),
          model: notes.model ? String(notes.model) : undefined,
          generatedAt: new Date().toISOString(),
        }
      : undefined,
  };

  await writeJsonAtomic(sessionPath(session.botId), persisted);
  return persisted;
}

