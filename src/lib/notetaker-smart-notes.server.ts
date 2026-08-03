import {
  meetingAiChat,
  meetingAiConfigured,
  type GroqMessage,
} from "@/lib/groq-chat.server";
import { expandParticipantNamesInMeetingNotes } from "@/lib/meeting-notes-names.server";

function chunkText(text: string, chunkSize: number, overlap: number) {
  const out: string[] = [];
  const t = String(text || "");
  let i = 0;
  while (i < t.length) {
    const end = Math.min(t.length, i + chunkSize);
    out.push(t.slice(i, end));
    if (end >= t.length) break;
    i = Math.max(0, end - overlap);
  }
  return out;
}

async function notesAiChat(messages: GroqMessage[]): Promise<{ content: string; model: string }> {
  // Prefer Groq (fast). DeepSeek V4 is a fallback and runs with thinking disabled.
  const result = await meetingAiChat(messages, 0.2);
  return { content: result.content, model: `${result.provider}:${result.model}` };
}

export async function runSmartMeetingNotes(data: {
  title?: string;
  transcriptText: string;
  /** Full names of meeting participants — used in prompts and to expand initials in output. */
  participantNames?: string[];
}) {
  if (!meetingAiConfigured()) {
    throw new Error("Missing GROQ_API_KEY or DEEPSEEK_API_KEY — meeting notes require an AI provider.");
  }

  const title = (data.title || "Meeting").trim();
  const transcript = String(data.transcriptText || "").trim();
  if (!transcript) {
    throw new Error("No transcript text to summarize. Wait for lines or Sync Recall first.");
  }

  const participantNames = [...new Set((data.participantNames ?? []).map((n) => n.trim()).filter(Boolean))];
  const participantLine = participantNames.length
    ? `Known participants (always use these full names, never initials): ${participantNames.join(", ")}`
    : "";

  // Keep generation under serverless time limits: one pass when possible, few chunks otherwise.
  const chunks =
    transcript.length <= 24_000 ? [transcript] : chunkText(transcript, 18_000, 600).slice(0, 6);
  const chunkSummaries: string[] = [];
  let modelUsed = "";

  const summarizeSys = [
    "You are Alyson Notetaker.",
    "Summarize the transcript chunk into high-signal bullet points.",
    "Extract: decisions, action items (with owner if mentioned), risks/blockers, and key context.",
    "Be concise. Do not hallucinate names or facts not in the chunk.",
    participantLine,
    "When naming people, use their full name from the participant list — never abbreviations or initials (e.g. use Thirumalai Nambi, not TN).",
  ]
    .filter(Boolean)
    .join("\n");

  if (chunks.length === 1) {
    const combineSys = [
      "You are Alyson Notetaker.",
      "Write final meeting notes from the transcript.",
      "Output in Markdown with these sections (only include sections that have content):",
      "- Summary",
      "- Decisions",
      "- Action items",
      "- Risks / blockers",
      "- Open questions",
      participantLine,
      "Use full participant names everywhere (summary, action item owners). Never use initials or abbreviations.",
      "Action items format: **Full Name**: task description",
      "Keep it tight and operational.",
      "Do not invent details not present in the transcript.",
      "Output raw Markdown only — do not wrap the response in ```markdown or other code fences.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await notesAiChat([
      { role: "system", content: combineSys },
      {
        role: "user",
        content: `Meeting: ${title}\n\nTranscript:\n${chunks[0]}`,
      },
    ]);
    modelUsed = result.model;
    const notesRaw = result.content.trim();
    if (!notesRaw) throw new Error("AI returned empty notes");

    const notes = participantNames.length
      ? expandParticipantNamesInMeetingNotes(notesRaw, participantNames)
      : notesRaw;

    return {
      notes,
      model: modelUsed,
      strategy: "single" as const,
      chunks: 1,
    };
  }

  for (let idx = 0; idx < chunks.length; idx++) {
    const part = chunks[idx];
    const result = await notesAiChat([
      { role: "system", content: summarizeSys },
      {
        role: "user",
        content: `Meeting: ${title}\n\nChunk ${idx + 1}/${chunks.length}:\n${part}`,
      },
    ]);
    modelUsed = result.model;
    if (result.content) chunkSummaries.push(result.content);
  }

  if (!chunkSummaries.length) {
    throw new Error("AI returned empty chunk summaries");
  }

  const combineSys = [
    "You are Alyson Notetaker.",
    "Combine multiple chunk summaries into final meeting notes.",
    "Output in Markdown with these sections (only include sections that have content):",
    "- Summary",
    "- Decisions",
    "- Action items",
    "- Risks / blockers",
    "- Open questions",
    participantLine,
    "Use full participant names everywhere (summary, action item owners). Never use initials or abbreviations.",
    "Action items format: **Full Name**: task description",
    "Keep it tight and operational.",
    "Do not invent details not present in the summaries.",
    "Output raw Markdown only — do not wrap the response in ```markdown or other code fences.",
  ]
    .filter(Boolean)
    .join("\n");

  const combined = await notesAiChat([
    { role: "system", content: combineSys },
    {
      role: "user",
      content: `Meeting: ${title}\n\nChunk summaries:\n\n${chunkSummaries.join("\n\n---\n\n")}`,
    },
  ]);
  modelUsed = combined.model;

  const notesRaw = combined.content.trim();
  if (!notesRaw) throw new Error("AI returned empty notes");

  const notes = participantNames.length
    ? expandParticipantNamesInMeetingNotes(notesRaw, participantNames)
    : notesRaw;

  return {
    notes,
    model: modelUsed,
    strategy: "chunked" as const,
    chunks: chunks.length,
  };
}
