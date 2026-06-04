export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

export function groqModel(): string {
  return process.env.ALYSON_MINI_MODULE_AI_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant";
}

export function groqApiKey(): string | null {
  const key = process.env.ALYSON_MINI_MODULE_AI_API_KEY || process.env.GROQ_API_KEY;
  return key?.trim() || null;
}

export async function groqChat(messages: GroqMessage[], temperature = 0.2): Promise<string> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    throw new Error("Groq is not configured (set GROQ_API_KEY or ALYSON_MINI_MODULE_AI_API_KEY).");
  }

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: groqModel(),
      temperature,
      messages,
    }),
  });

  const text = await r.text();
  let json: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg = json?.error?.message || text.slice(0, 300) || `Groq request failed (${r.status})`;
    throw new Error(String(msg));
  }
  return String(json?.choices?.[0]?.message?.content || "").trim();
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    return JSON.parse(fence[1].trim());
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("Model did not return valid JSON.");
}
