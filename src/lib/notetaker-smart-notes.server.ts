import { deepseekApiKey, deepseekChat, resolveDeepseekModel, type GroqMessage } from "@/lib/groq-chat.server";
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

async function deepseekNotesChat(messages: GroqMessage[], model: string): Promise<string> {
  return deepseekChat(messages, 0.2, { model });
}

export async function runSmartMeetingNotes(data: {
  title?: string;
  transcriptText: string;
  /** Full names of meeting participants — used in prompts and to expand initials in output. */
  participantNames?: string[];
}) {
  if (!deepseekApiKey()) {
    throw new Error("Missing DEEPSEEK_API_KEY — meeting notes require DeepSeek.");
  }

  const title = (data.title || "Meeting").trim();
  const transcript = String(data.transcriptText || "").trim();
  const participantNames = [...new Set((data.participantNames ?? []).map((n) => n.trim()).filter(Boolean))];
  const participantLine = participantNames.length
    ? `Known participants (always use these full names, never initials): ${participantNames.join(", ")}`
    : "";
  const model = await resolveDeepseekModel();

  const chunks =
    transcript.length <= 12_000 ? [transcript] : chunkText(transcript, 10_000, 800).slice(0, 20);
  const chunkSummaries: string[] = [];

  for (let idx = 0; idx < chunks.length; idx++) {
    const part = chunks[idx];
    const sys = [
      "You are Alyson Notetaker.",
      "Summarize the transcript chunk into high-signal bullet points.",
      "Extract: decisions, action items (with owner if mentioned), risks/blockers, and key context.",
      "Be concise. Do not hallucinate names or facts not in the chunk.",
      participantLine,
      "When naming people, use their full name from the participant list — never abbreviations or initials (e.g. use Thirumalai Nambi, not TN).",
    ]
      .filter(Boolean)
      .join("\n");
    const summary = await deepseekNotesChat(
      [
        { role: "system", content: sys },
        {
          role: "user",
          content: `Meeting: ${title}\n\nChunk ${idx + 1}/${chunks.length}:\n${part}`,
        },
      ],
      model,
    );
    if (summary) chunkSummaries.push(summary);
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

  const combined = await deepseekNotesChat(
    [
      { role: "system", content: combineSys },
      {
        role: "user",
        content: `Meeting: ${title}\n\nChunk summaries:\n\n${chunkSummaries.join("\n\n---\n\n")}`,
      },
    ],
    model,
  );

  const notesRaw = combined.trim();
  if (!notesRaw) throw new Error("DeepSeek returned empty notes");

  const notes = participantNames.length
    ? expandParticipantNamesInMeetingNotes(notesRaw, participantNames)
    : notesRaw;

  return {
    notes,
    model,
    strategy: chunks.length > 1 ? "chunked" : "single",
    chunks: chunks.length,
  };
}
