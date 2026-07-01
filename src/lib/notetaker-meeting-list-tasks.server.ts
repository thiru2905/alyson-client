import { createHash } from "node:crypto";
import { z } from "zod";
import {
  deepseekApiKey,
  deepseekChat,
  extractJsonObject,
  resolveDeepseekModel,
} from "@/lib/groq-chat.server";
import {
  getNotesMdFromS3,
  getTasksJsonFromS3,
  getTranscriptTextFromS3,
  putTasksJsonToS3,
  invalidateNotetakerCalendarS3Cache,
} from "@/lib/notetaker-s3-calendar.server";
import { loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import {
  resolveMeetingParticipants,
  type MeetingParticipant,
} from "@/lib/notetaker-meeting-participants.server";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";
import {
  looksLikeEmail,
  resolveCanonicalEmail,
  resolveCanonicalSpeaker,
} from "@/lib/speaker-identity";
import { meetingTasksKey, type MeetingListPersonTasks, type MeetingListTask } from "@/lib/notetaker-meeting-ui";

const ExtractedTaskSchema = z.object({
  title: z.string(),
  dueHint: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["open", "done", "unclear"]).optional(),
  sourceQuote: z.string().optional().nullable(),
});

const PersonTasksSchema = z.object({
  name: z.string(),
  email: z.string().optional().nullable(),
  tasks: z.array(ExtractedTaskSchema).default([]),
});

const MeetingTasksByPersonSchema = z.object({
  people: z.array(PersonTasksSchema).default([]),
});

const StoredTasksDocSchema = z.object({
  version: z.literal(1),
  people: z.array(
    z.object({
      personKey: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      tasks: z.array(
        z.object({
          title: z.string(),
          dueHint: z.string().nullable(),
          priority: z.enum(["low", "medium", "high"]),
          status: z.enum(["open", "done", "unclear"]),
          sourceQuote: z.string().nullable(),
        }),
      ),
    }),
  ),
  model: z.string(),
  generatedAt: z.string(),
  sourceHash: z.string(),
  warnings: z.array(z.string()).default([]),
});

const TASK_CACHE_MS = 30 * 60_000;
const taskCache = new Map<string, { at: number; result: MeetingListTasksPayload }>();

export type MeetingListTasksPayload = {
  people: MeetingListPersonTasks[];
  model: string;
  generatedAt: string;
  warnings: string[];
  fromS3?: boolean;
};

function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sourceHash(notesMd: string, transcriptText: string): string {
  return contentHash(`${notesMd}\n---\n${transcriptText}`);
}

function personKey(name: string, email?: string | null) {
  return (email || name).trim().toLowerCase();
}

function normalizeTask(raw: z.infer<typeof ExtractedTaskSchema>): MeetingListTask {
  return {
    title: raw.title.trim(),
    dueHint: raw.dueHint?.trim() || null,
    priority: raw.priority ?? "medium",
    status: raw.status ?? "open",
    sourceQuote: raw.sourceQuote?.trim() || null,
  };
}

function buildParticipantRoster(
  participants: MeetingParticipant[],
  identity: Awaited<ReturnType<typeof getSpeakerIdentityIndex>>["index"],
) {
  return participants.map((p) => {
    const canonical = resolveCanonicalSpeaker(p.name, identity);
    const email = looksLikeEmail(p.name) ? resolveCanonicalEmail(p.name, identity) : null;
    return {
      name: canonical || p.name,
      email,
      source: p.source,
    };
  });
}

function buildExtractionContext(args: {
  title: string;
  day: string;
  notesMd: string;
  transcriptText: string;
  roster: ReturnType<typeof buildParticipantRoster>;
}) {
  const participantLine = args.roster.length
    ? args.roster.map((p) => `- ${p.name}${p.email ? ` (${p.email})` : ""}`).join("\n")
    : "- (no participants parsed)";

  const parts = [
    `Meeting: ${args.title}`,
    `Date: ${args.day}`,
    "",
    "Participants:",
    participantLine,
    "",
  ];

  const notes = args.notesMd.trim().slice(0, 6_000);
  if (notes) parts.push("Meeting notes (markdown):", notes, "");

  const transcript = args.transcriptText.trim().slice(0, 8_000);
  if (transcript) parts.push("Transcript:", transcript);

  return parts.join("\n");
}

async function extractTasksWithDeepseek(args: {
  title: string;
  day: string;
  notesMd: string;
  transcriptText: string;
  roster: ReturnType<typeof buildParticipantRoster>;
}): Promise<{ people: MeetingListPersonTasks[]; model: string }> {
  if (!deepseekApiKey()) {
    throw new Error("DEEPSEEK_API_KEY is required to extract meeting tasks.");
  }

  const model = await resolveDeepseekModel();
  const context = buildExtractionContext(args);
  const rosterNames = args.roster.map((p) => p.name).join(", ") || "meeting participants";

  const sys = [
    "You are Alyson Meeting Tasks.",
    "Extract actionable tasks and follow-ups from meeting notes and/or transcript.",
    `Assign each task to exactly one person from this participant list: ${rosterNames}.`,
    "Return ONLY valid JSON with this shape:",
    '{"people":[{"name":"Person Name","email":"optional@email.com","tasks":[{"title":"...","dueHint":"...","priority":"low|medium|high","status":"open|done|unclear","sourceQuote":"..."}]}]}',
    "Rules:",
    "- Include one entry per participant who has at least one task; omit people with zero tasks.",
    "- Only assign tasks to people in the participant list — use their exact name.",
    "- Do not invent owners, deadlines, or tasks not supported by the text.",
    "- Prefer open items; mark done only when explicitly completed.",
    "- If no tasks for anyone, return {\"people\":[]}.",
    "- Max 6 tasks per person.",
  ].join("\n");

  const raw = await deepseekChat(
    [
      { role: "system", content: sys },
      { role: "user", content: context },
    ],
    0.1,
    { model },
  );

  const parsed = MeetingTasksByPersonSchema.parse(extractJsonObject(raw));
  const rosterByKey = new Map(args.roster.map((p) => [personKey(p.name, p.email), p]));

  const people: MeetingListPersonTasks[] = [];
  for (const row of parsed.people) {
    const name = row.name.trim();
    if (!name) continue;
    const email = row.email?.trim() || rosterByKey.get(personKey(name, row.email))?.email || null;
    const tasks = row.tasks.map(normalizeTask).filter((t) => t.title).slice(0, 6);
    if (tasks.length === 0) continue;
    people.push({ personKey: personKey(name, email), name, email, tasks });
  }

  people.sort((a, b) => a.name.localeCompare(b.name));
  return { people, model };
}

async function loadMeetingContent(args: {
  notesKey?: string | null;
  transcriptKey?: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
}) {
  const warnings: string[] = [];
  let notesMd = "";
  let transcriptText = "";

  if (args.notesKey && args.hasNotes !== false) {
    try {
      notesMd = await getNotesMdFromS3({ notesKey: args.notesKey });
    } catch {
      warnings.push("Notes could not be loaded from S3.");
    }
  }

  if (args.transcriptKey && args.hasTranscript !== false) {
    try {
      transcriptText = await getTranscriptTextFromS3({ transcriptKey: args.transcriptKey });
    } catch {
      warnings.push("Transcript could not be loaded from S3.");
    }
  }

  if (!notesMd.trim() && !transcriptText.trim()) {
    throw new Error("No notes or transcript available to extract tasks.");
  }

  return { notesMd, transcriptText, warnings };
}

async function readStoredTasksFromS3(
  tasksKey: string,
  expectedHash: string,
): Promise<MeetingListTasksPayload | null> {
  const raw = await getTasksJsonFromS3({ tasksKey });
  if (!raw?.trim()) return null;

  try {
    const doc = StoredTasksDocSchema.parse(JSON.parse(raw));
    if (doc.sourceHash !== expectedHash) return null;
    return {
      people: doc.people,
      model: doc.model,
      generatedAt: doc.generatedAt,
      warnings: doc.warnings,
      fromS3: true,
    };
  } catch {
    return null;
  }
}

export async function persistMeetingTasksToS3(args: {
  prefix: string;
  tasksKey: string;
  payload: MeetingListTasksPayload;
  sourceHash: string;
  botId?: string | null;
}): Promise<void> {
  const doc = {
    version: 1 as const,
    people: args.payload.people,
    model: args.payload.model,
    generatedAt: args.payload.generatedAt,
    sourceHash: args.sourceHash,
    warnings: args.payload.warnings,
  };

  await putTasksJsonToS3({
    tasksKey: args.tasksKey,
    body: JSON.stringify(doc, null, 2),
    metadata: {
      kind: "alyson-notetaker-meeting-tasks",
      prefix: args.prefix,
      ...(args.botId ? { "bot-id": args.botId } : {}),
    },
  });

  invalidateNotetakerCalendarS3Cache();
}

export async function ensureMeetingTasksInS3(args: {
  prefix: string;
  title: string;
  day: string;
  notesKey?: string | null;
  transcriptKey?: string | null;
  botId?: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
  forceRefresh?: boolean;
}): Promise<{ ok: boolean; skipped?: string; payload?: MeetingListTasksPayload }> {
  try {
    const payload = await resolveMeetingListTasks({
      ...args,
      forceRefresh: args.forceRefresh ?? false,
    });
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, skipped: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveMeetingListTasks(args: {
  prefix: string;
  title: string;
  day: string;
  notesKey?: string | null;
  transcriptKey?: string | null;
  botId?: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
  forceRefresh?: boolean;
}): Promise<MeetingListTasksPayload> {
  const cacheKey = args.prefix;
  if (!args.forceRefresh) {
    const hit = taskCache.get(cacheKey);
    if (hit && Date.now() - hit.at < TASK_CACHE_MS) return hit.result;
  }

  const tasksKey = meetingTasksKey({
    prefix: args.prefix,
    botId: args.botId ?? null,
    day: args.day,
    title: args.title,
    startedAt: null,
    notesKey: args.notesKey ?? null,
    transcriptKey: args.transcriptKey ?? null,
    tasksKey: null,
  });

  const { notesMd, transcriptText, warnings } = await loadMeetingContent(args);
  const hash = sourceHash(notesMd, transcriptText);

  if (!args.forceRefresh) {
    const fromS3 = await readStoredTasksFromS3(tasksKey, hash);
    if (fromS3) {
      taskCache.set(cacheKey, { at: Date.now(), result: fromS3 });
      return fromS3;
    }
  }

  const participants = await resolveMeetingParticipants({
    transcriptKey: args.transcriptKey,
    botId: args.botId,
    hasTranscript: args.hasTranscript,
    transcriptText: transcriptText || null,
  });

  const { index: identity, warnings: identityWarnings } = await getSpeakerIdentityIndex();
  warnings.push(...identityWarnings.slice(0, 2));

  const roster = buildParticipantRoster(participants, identity);
  if (roster.length === 0) {
    warnings.push("No participants found — tasks may be unassigned.");
  }

  const { people, model } = await extractTasksWithDeepseek({
    title: args.title,
    day: args.day,
    notesMd,
    transcriptText,
    roster,
  });

  const result: MeetingListTasksPayload = {
    people,
    model,
    generatedAt: new Date().toISOString(),
    warnings: warnings.slice(0, 6),
    fromS3: false,
  };

  await persistMeetingTasksToS3({
    prefix: args.prefix,
    tasksKey,
    payload: result,
    sourceHash: hash,
    botId: args.botId,
  });

  taskCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

/** Read tasks from S3 only — no DeepSeek generation. */
export async function readMeetingListTasksFromS3(args: {
  prefix: string;
  tasksKey: string;
  notesKey?: string | null;
  transcriptKey?: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
}): Promise<MeetingListTasksPayload | null> {
  const content = await loadMeetingContent(args).catch(() => null);
  if (!content) return null;
  const { notesMd, transcriptText } = content;
  if (!notesMd && !transcriptText) return null;
  const hash = sourceHash(notesMd ?? "", transcriptText ?? "");
  return readStoredTasksFromS3(args.tasksKey, hash);
}

export async function ensureMeetingTasksForBot(botId: string): Promise<void> {
  const idx = await loadBotIndexDoc(botId).catch(() => null);
  if (!idx?.prefix) return;

  const prefix = String(idx.prefix);
  await ensureMeetingTasksInS3({
    prefix,
    title: String(idx.title || "Meeting"),
    day: prefix.split("_").slice(-2, -1)[0] || new Date().toISOString().slice(0, 10),
    notesKey: idx.notesKey ?? `alyson-notetaker/meetingnotes/${prefix}/notes.md`,
    transcriptKey: idx.transcriptKey ?? `alyson-notetaker/transcripts/${prefix}/transcript.txt`,
    botId,
    hasNotes: Boolean(idx.notesKey),
    hasTranscript: Boolean(idx.transcriptKey),
  }).catch(() => {
    // best-effort background generation
  });
}

/** Generate tasks once transcript + notes are both in S3 (after meeting ends). */
export async function maybeGenerateMeetingTasksWhenReady(botId: string): Promise<void> {
  const id = String(botId || "").trim();
  if (!id) return;

  const idx = await loadBotIndexDoc(id).catch(() => null);
  if (!idx?.prefix) return;

  const prefix = String(idx.prefix);
  const transcriptKey = idx.transcriptKey ?? `alyson-notetaker/transcripts/${prefix}/transcript.txt`;
  const notesKey = idx.notesKey ?? `alyson-notetaker/meetingnotes/${prefix}/notes.md`;

  let transcriptText = "";
  let notesMd = "";
  try {
    transcriptText = await getTranscriptTextFromS3({ transcriptKey });
  } catch {
    return;
  }
  if (!transcriptText.trim()) return;

  try {
    notesMd = await getNotesMdFromS3({ notesKey });
  } catch {
    return;
  }
  if (!notesMd.trim()) return;

  await ensureMeetingTasksForBot(id);
}

export type BackfillMeetingTasksResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  remainingMissing: number;
  results: Array<{ prefix: string; botId: string | null; ok: boolean; skipped?: string }>;
};

/** Generate tasks.json for every meeting in S3 that has notes + transcript but no tasks yet. */
export async function backfillAllMeetingTasksFromS3(): Promise<BackfillMeetingTasksResult> {
  const { auditTasksCoverageFromS3 } = await import("@/lib/notetaker-s3-calendar.server");
  const report = await auditTasksCoverageFromS3();
  const results: BackfillMeetingTasksResult["results"] = [];

  for (const m of report.missingTasks) {
    const r = await ensureMeetingTasksInS3({
      prefix: m.prefix,
      title: m.title,
      day: m.day,
      notesKey: m.notesKey,
      transcriptKey: m.transcriptKey,
      botId: m.botId,
      hasNotes: true,
      hasTranscript: true,
    });
    results.push({
      prefix: m.prefix,
      botId: m.botId,
      ok: r.ok,
      skipped: r.skipped,
    });
  }

  const after = await auditTasksCoverageFromS3();
  return {
    attempted: results.length,
    succeeded: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    remainingMissing: after.missingTasks.length,
    results,
  };
}
