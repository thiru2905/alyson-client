import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  title: z.string().optional(),
  transcriptText: z.string().min(1).max(500_000),
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function groqChat(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const apiKey = process.env.ALYSON_MINI_MODULE_AI_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.ALYSON_MINI_MODULE_AI_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.2,
      messages,
    }),
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg = json?.error?.message || json?.error || (text && text.slice(0, 300)) || `Groq request failed (${r.status})`;
    throw new Error(String(msg));
  }
  return String(json?.choices?.[0]?.message?.content || "").trim();
}

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

export const generateSmartMeetingNotes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    // Keep env check explicit for better error messages.
    requireEnv(process.env.ALYSON_MINI_MODULE_AI_API_KEY ? "ALYSON_MINI_MODULE_AI_API_KEY" : "GROQ_API_KEY");

    const title = (data.title || "Meeting").trim();
    const transcript = String(data.transcriptText || "").trim();

    const chunks = chunkText(transcript, 10_000, 800).slice(0, 20); // hard cap to avoid runaway cost
    const chunkSummaries: string[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      const part = chunks[idx];
      const sys = [
        "You are Alyson Notetaker.",
        "Summarize the transcript chunk into high-signal bullet points.",
        "Extract: decisions, action items (with owner if mentioned), risks/blockers, and key context.",
        "Be concise. Do not hallucinate names or facts not in the chunk.",
      ].join("\n");
      const summary = await groqChat([
        { role: "system", content: sys },
        { role: "user", content: `Meeting: ${title}\n\nChunk ${idx + 1}/${chunks.length}:\n${part}` },
      ]);
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
      "Keep it tight and operational.",
      "Do not invent details not present in the summaries.",
    ].join("\n");

    const combined = await groqChat([
      { role: "system", content: combineSys },
      { role: "user", content: `Meeting: ${title}\n\nChunk summaries:\n\n${chunkSummaries.join("\n\n---\n\n")}` },
    ]);

    return {
      notes: combined || "I couldn’t generate notes. Please try again.",
      model: process.env.ALYSON_MINI_MODULE_AI_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      strategy: chunks.length > 1 ? "chunked" : "single",
      chunks: chunks.length,
    };
  });

