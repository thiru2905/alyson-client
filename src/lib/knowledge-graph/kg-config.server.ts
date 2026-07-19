/** Env + feature flags for Knowledge Graph (defaults OFF so main/prod stays untouched). */

export function knowledgeGraphEnabled(): boolean {
  return String(process.env.KNOWLEDGE_GRAPH_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export function knowledgeGraphCompanyDomain(): string {
  return (
    process.env.KNOWLEDGE_GRAPH_COMPANY_DOMAIN?.trim().toLowerCase() ||
    process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase() ||
    "cintara.ai"
  );
}

export function neo4jUri(): string {
  return process.env.NEO4J_URI?.trim() || "bolt://localhost:7687";
}

export function neo4jUser(): string {
  return process.env.NEO4J_USER?.trim() || "neo4j";
}

export function neo4jPassword(): string {
  return process.env.NEO4J_PASSWORD?.trim() || "password";
}

export function knowledgeGraphMaxMeetingsPerRun(): number {
  const n = Number(process.env.KNOWLEDGE_GRAPH_MAX_MEETINGS_PER_RUN ?? "25");
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 200) : 25;
}

export function knowledgeGraphTranscriptChars(): number {
  const n = Number(process.env.KNOWLEDGE_GRAPH_TRANSCRIPT_CHARS ?? "12000");
  return Number.isFinite(n) && n >= 2000 ? Math.min(Math.floor(n), 80_000) : 12_000;
}

export function isCompanyEmail(email: string, domain = knowledgeGraphCompanyDomain()): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  return e.endsWith(`@${domain}`);
}

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function slugKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
