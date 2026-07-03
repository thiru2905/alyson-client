/**
 * One-shot: delete Recall-hosted recording media for bots that already have S3 transcripts.
 * Run: npx tsx scripts/purge-recall-recording-media.ts
 */
import "dotenv/config";
import { runRecallMediaCleanup } from "../src/lib/notetaker-recall-media-cleanup.server";

async function main() {
  const result = await runRecallMediaCleanup();
  console.log(JSON.stringify(result, null, 2));
  if (result.deleted === 0 && result.eligible > 0) {
    console.error("No deletions — check RECALL_API_KEY and bot states (in_call blocks delete).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
