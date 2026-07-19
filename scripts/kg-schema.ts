#!/usr/bin/env node
/**
 * Bootstraps Neo4j schema for Alyson Knowledge Graph.
 * Usage: dotenv -e .env -- npx tsx scripts/kg-schema.ts
 */
import { ensureKnowledgeGraphSchema } from "../src/lib/knowledge-graph/kg-schema.server.ts";
import { closeNeo4jDriver, neo4jHealthCheck } from "../src/lib/knowledge-graph/kg-neo4j.server.ts";

async function main() {
  const health = await neo4jHealthCheck();
  console.log(JSON.stringify({ health }, null, 2));
  if (!health.ok && process.env.KNOWLEDGE_GRAPH_ENABLED !== "true") {
    console.warn("Tip: set KNOWLEDGE_GRAPH_ENABLED=true and ensure Docker Neo4j is up.");
  }
  // Allow schema create even if enabled=false when running this script explicitly.
  process.env.KNOWLEDGE_GRAPH_ENABLED = process.env.KNOWLEDGE_GRAPH_ENABLED || "true";
  const applied = await ensureKnowledgeGraphSchema();
  console.log(JSON.stringify(applied, null, 2));
  await closeNeo4jDriver();
}

main().catch(async (e) => {
  console.error(e);
  await closeNeo4jDriver().catch(() => {});
  process.exit(1);
});
