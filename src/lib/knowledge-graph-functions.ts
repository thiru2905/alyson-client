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
  let recentMeetings = [] as Awaited<
    ReturnType<typeof import("@/lib/knowledge-graph/kg-queries.server").queryRecentMeetings>
  >;
  if (health.ok) {
    try {
      const { queryGraphSummary, queryRecentMeetings } = await import(
        "@/lib/knowledge-graph/kg-queries.server"
      );
      // Sequential: keep the first paint fast and avoid multi-session contention.
      summary = await queryGraphSummary();
      recentMeetings = await queryRecentMeetings(20);
    } catch (e) {
      return {
        enabled: knowledgeGraphEnabled(),
        domain: knowledgeGraphCompanyDomain(),
        uri: neo4jUri(),
        health: {
          ...health,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        },
        summary: null,
        recentMeetings: [],
        workspacePlan: describeWorkspaceIngestPlan(),
      };
    }
  }
  return {
    enabled: knowledgeGraphEnabled(),
    domain: knowledgeGraphCompanyDomain(),
    uri: neo4jUri(),
    health,
    summary,
    recentMeetings,
    workspacePlan: describeWorkspaceIngestPlan(),
  };
});

export const getKnowledgeGraphOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { knowledgeGraphEnabled } = await import("@/lib/knowledge-graph/kg-config.server");
  const { neo4jHealthCheck } = await import("@/lib/knowledge-graph/kg-neo4j.server");
  const health = await neo4jHealthCheck();
  if (!health.ok) {
    return {
      enabled: knowledgeGraphEnabled(),
      health,
      overview: null,
    };
  }
  try {
    const { queryOverviewInsights } = await import("@/lib/knowledge-graph/kg-queries.server");
    const overview = await queryOverviewInsights();
    return { enabled: knowledgeGraphEnabled(), health, overview };
  } catch (e) {
    return {
      enabled: knowledgeGraphEnabled(),
      health: {
        ...health,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      overview: null,
    };
  }
});

export const runKnowledgeGraphSyncFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ maxMeetings: z.number().int().min(1).max(500).optional() })
      .optional()
      .parse(data),
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

export const queryMeetingNeighborhoodFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ botId: z.string().min(1), limit: z.number().int().min(1).max(80).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { queryMeetingNeighborhood } = await import("@/lib/knowledge-graph/kg-queries.server");
    return queryMeetingNeighborhood(data.botId, data.limit);
  });

export const bootstrapKnowledgeGraphSchemaFn = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureKnowledgeGraphSchema } = await import("@/lib/knowledge-graph/kg-schema.server");
  return ensureKnowledgeGraphSchema();
});
