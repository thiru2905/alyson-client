#!/usr/bin/env node
import { knowledgeGraphCompanyDomain, knowledgeGraphEnabled, neo4jUri } from "../src/lib/knowledge-graph/kg-config.server.ts";
import { closeNeo4jDriver, neo4jHealthCheck } from "../src/lib/knowledge-graph/kg-neo4j.server.ts";
import { queryGraphSummary } from "../src/lib/knowledge-graph/kg-queries.server.ts";
import { describeWorkspaceIngestPlan } from "../src/lib/knowledge-graph/kg-workspace-ingest.server.ts";

async function main() {
  const health = await neo4jHealthCheck();
  let summary = null;
  if (health.ok || process.env.NEO4J_URI) {
    try {
      // Status works even when feature flag is false if Neo4j is reachable.
      summary = await queryGraphSummary();
    } catch (e) {
      summary = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  console.log(
    JSON.stringify(
      {
        enabled: knowledgeGraphEnabled(),
        domain: knowledgeGraphCompanyDomain(),
        uri: neo4jUri(),
        health,
        summary,
        workspacePlan: describeWorkspaceIngestPlan(),
      },
      null,
      2,
    ),
  );
  await closeNeo4jDriver();
}

main().catch(async (e) => {
  console.error(e);
  await closeNeo4jDriver().catch(() => {});
  process.exit(1);
});
