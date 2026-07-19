import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getKnowledgeGraphStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { knowledgeGraphEnabled, knowledgeGraphCompanyDomain, neo4jUri } = await import(
    "@/lib/knowledge-graph/kg-config.server"
  );
  const { neo4jHealthCheck } = await import("@/lib/knowledge-graph/kg-neo4j.server");
  const { describeWorkspaceIngestPlan } = await import(
    "@/lib/knowledge-graph/kg-workspace-ingest.server"
  );
  const health = await neo4jHealthCheck();
  let summary = null as Awaited<
    ReturnType<typeof import("@/lib/knowledge-graph/kg-queries.server").queryGraphSummary>
  > | null;
  if (health.ok) {
    try {
      const { queryGraphSummary } = await import("@/lib/knowledge-graph/kg-queries.server");
      summary = await queryGraphSummary();
    } catch {
      summary = null;
    }
  }
  return {
    enabled: knowledgeGraphEnabled(),
    domain: knowledgeGraphCompanyDomain(),
    uri: neo4jUri(),
    health,
    summary,
    workspacePlan: describeWorkspaceIngestPlan(),
  };
});

export const runKnowledgeGraphSyncFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ maxMeetings: z.number().int().min(1).max(100).optional() }).optional().parse(data),
  )
  .handler(async ({ data }) => {
    const { runKnowledgeGraphMeetingSync } = await import(
      "@/lib/knowledge-graph/kg-sync-meetings.server"
    );
    return runKnowledgeGraphMeetingSync({ maxMeetings: data?.maxMeetings });
  });

export const queryPersonMeetingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().email(),
        fromDay: z.string().optional(),
        toDay: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { queryPersonMeetings, queryPersonProjects } = await import(
      "@/lib/knowledge-graph/kg-queries.server"
    );
    const meetings = await queryPersonMeetings(data);
    const projects = await queryPersonProjects(data.email);
    return { meetings, projects };
  });

export const bootstrapKnowledgeGraphSchemaFn = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureKnowledgeGraphSchema } = await import("@/lib/knowledge-graph/kg-schema.server");
  return ensureKnowledgeGraphSchema();
});
