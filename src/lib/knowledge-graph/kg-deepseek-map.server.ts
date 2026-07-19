import { deepseekApiKey, deepseekChat, resolveDeepseekModel } from "@/lib/groq-chat.server";
import {
  knowledgeGraphCompanyDomain,
  normalizeEmail,
  slugKey,
} from "@/lib/knowledge-graph/kg-config.server";
import type { KgExtractedGraph, KgEdgeType } from "@/lib/knowledge-graph/kg-types";

const EDGE_TYPES = new Set<KgEdgeType>([
  "ATTENDED",
  "ORGANIZED",
  "MENTIONS",
  "WORKS_ON",
  "ASSIGNED_TO",
  "ABOUT",
  "RELATED_TO",
  "CREATED",
  "SENT",
  "POSTED_IN",
]);

function extractJsonObject(text: string): unknown {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() || trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DeepSeek response did not contain a JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * DeepSeek maps a meeting transcript/notes excerpt into people, projects, tasks, topics + edges.
 * Designed for cintara.ai (or KNOWLEDGE_GRAPH_COMPANY_DOMAIN) knowledge graphs.
 */
export async function mapMeetingToKnowledgeGraph(args: {
  botId: string;
  title: string;
  notesMd?: string;
  transcriptText?: string;
}): Promise<KgExtractedGraph> {
  if (!deepseekApiKey()) {
    throw new Error("Missing DEEPSEEK_API_KEY — knowledge graph mapping requires DeepSeek");
  }

  const domain = knowledgeGraphCompanyDomain();
  const model = await resolveDeepseekModel();
  const notes = String(args.notesMd || "").trim().slice(0, 10_000);
  const transcript = String(args.transcriptText || "").trim().slice(0, 12_000);

  const system = `You extract a knowledge graph from a company meeting for domain @${domain}.
Return ONLY valid JSON matching this schema:
{
  "people": [{"email":"user@${domain}","name":"Display Name"}],
  "projects": [{"key":"slug","name":"Project Name","confidence":0.0-1.0}],
  "tasks": [{"key":"slug","text":"Action item","status":"open|done|unknown"}],
  "topics": [{"key":"slug","name":"Theme"}],
  "relationships": [{
    "type":"ATTENDED|ORGANIZED|MENTIONS|WORKS_ON|ASSIGNED_TO|ABOUT|RELATED_TO|CREATED|SENT|POSTED_IN",
    "from":{"kind":"Person|Meeting|Project|Task|Topic","key":"email-or-slug-or-botId"},
    "to":{"kind":"Person|Meeting|Project|Task|Topic","key":"email-or-slug-or-botId"},
    "evidence":"short quote"
  }]
}
Rules:
- Prefer real @${domain} emails when known; otherwise omit email people you cannot identify.
- Meeting node key is always the botId provided.
- Infer projects the team is working on from recurring product/system names.
- Tasks should be concrete action items already visible in notes/transcript.
- Do not invent emails outside ${domain} unless clearly present in the text.
- Keep arrays short: max 20 people, 12 projects, 20 tasks, 12 topics, 40 relationships.`;

  const user = `Meeting botId: ${args.botId}
Title: ${args.title}

NOTES:
${notes || "(none)"}

TRANSCRIPT EXCERPT:
${transcript || "(none)"}`;

  const raw = await deepseekChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    0.1,
    { model },
  );

  const parsed = extractJsonObject(raw) as Partial<KgExtractedGraph>;
  return normalizeExtractedGraph(parsed, args.botId);
}

function normalizeExtractedGraph(raw: Partial<KgExtractedGraph>, botId: string): KgExtractedGraph {
  const domain = knowledgeGraphCompanyDomain();
  const people = (raw.people || [])
    .map((p) => ({
      email: normalizeEmail(String(p.email || "")),
      name: String(p.name || "").trim() || undefined,
      domain,
    }))
    .filter((p) => p.email.includes("@") && p.email.endsWith(`@${domain}`))
    .slice(0, 20);

  const projects = (raw.projects || [])
    .map((p) => ({
      key: slugKey(p.key || p.name),
      name: String(p.name || p.key || "").trim(),
      confidence: typeof p.confidence === "number" ? p.confidence : undefined,
    }))
    .filter((p) => p.key && p.name)
    .slice(0, 12);

  const tasks = (raw.tasks || [])
    .map((t) => ({
      key: slugKey(t.key || t.text),
      text: String(t.text || "").trim(),
      status: String(t.status || "unknown").trim(),
    }))
    .filter((t) => t.key && t.text)
    .slice(0, 20);

  const topics = (raw.topics || [])
    .map((t) => ({
      key: slugKey(t.key || t.name),
      name: String(t.name || t.key || "").trim(),
    }))
    .filter((t) => t.key && t.name)
    .slice(0, 12);

  const relationships = (raw.relationships || [])
    .map((r) => {
      const type = String(r.type || "").trim().toUpperCase() as KgEdgeType;
      if (!EDGE_TYPES.has(type)) return null;
      const fromKind = String(r.from?.kind || "").trim();
      const toKind = String(r.to?.kind || "").trim();
      let fromKey = String(r.from?.key || "").trim();
      let toKey = String(r.to?.key || "").trim();
      if (fromKind === "Meeting") fromKey = botId;
      if (toKind === "Meeting") toKey = botId;
      if (fromKind === "Person") fromKey = normalizeEmail(fromKey);
      if (toKind === "Person") toKey = normalizeEmail(toKey);
      if (fromKind === "Project" || fromKind === "Task" || fromKind === "Topic") fromKey = slugKey(fromKey);
      if (toKind === "Project" || toKind === "Task" || toKind === "Topic") toKey = slugKey(toKey);
      if (!fromKey || !toKey) return null;
      return {
        type,
        from: { kind: fromKind as "Person" | "Meeting" | "Project" | "Task" | "Topic", key: fromKey },
        to: { kind: toKind as "Person" | "Meeting" | "Project" | "Task" | "Topic", key: toKey },
        evidence: String(r.evidence || "").trim().slice(0, 240) || undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 40) as KgExtractedGraph["relationships"];

  return { people, projects, tasks, topics, relationships };
}
