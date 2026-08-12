import { closeNeo4jDriver } from "../src/lib/knowledge-graph/kg-neo4j.server.ts";
import {
  queryGraphSummary,
  queryOverviewInsights,
  queryRecentMeetings,
} from "../src/lib/knowledge-graph/kg-queries.server.ts";

async function main() {
  const summary = await queryGraphSummary();
  console.log("summary", JSON.stringify(summary));
  const recent = await queryRecentMeetings(3);
  console.log("recent", recent.length, recent[0]?.title ?? null);
  const overview = await queryOverviewInsights();
  console.log(
    "overview",
    JSON.stringify({
      meetings: overview.summary.meetings,
      recent: overview.recentMeetings.length,
      topPeople: overview.topPeople.length,
    }),
  );
  await closeNeo4jDriver();
}

main().catch(async (e) => {
  console.error(e);
  await closeNeo4jDriver().catch(() => {});
  process.exit(1);
});
