/** Streaming client for the alyson-ai edge function. SSE -> token deltas. */

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alyson-ai`;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function streamAlyson({
  messages,
  page,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: ChatMsg[];
  page?: string;
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  signal?: AbortSignal;
}) {
  let resp: Response;
  try {
    resp = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, page }),
      signal,
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : "Network error");
    return;
  }

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) return onError("Rate limit reached. Try again shortly.");
    if (resp.status === 402)
      return onError("AI credits exhausted — top up in Workspace settings.");
    return onError("AI gateway error");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") {
        done = true;
        break;
      }
      try {
        const p = JSON.parse(json);
        const delta = p.choices?.[0]?.delta?.content as string | undefined;
        if (delta) onDelta(delta);
      } catch {
        // partial JSON across chunks — put back
        buf = line + "\n" + buf;
        break;
      }
    }
  }
  onDone();
}
