#!/usr/bin/env node
/**
 * Sync ready Notetaker meetings from S3 → DeepSeek → Neo4j.
 * Usage: dotenv -e .env -- npx tsx scripts/kg-sync.ts
 */
import { runKnowledgeGraphMeetingSync } from "../src/lib/knowledge-graph/kg-sync-meetings.server.ts";
import { closeNeo4jDriver } from "../src/lib/knowledge-graph/kg-neo4j.server.ts";

async function main() {
  process.env.KNOWLEDGE_GRAPH_ENABLED = process.env.KNOWLEDGE_GRAPH_ENABLED || "true";
  const max = Number(process.argv[2] || process.env.KNOWLEDGE_GRAPH_MAX_MEETINGS_PER_RUN || 5);
  const result = await runKnowledgeGraphMeetingSync({
    maxMeetings: Number.isFinite(max) ? max : 5,
  });
  console.log(JSON.stringify(result, null, 2));
  await closeNeo4jDriver();
  if (!result.ok) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await closeNeo4jDriver().catch(() => {});
  process.exit(1);
});
