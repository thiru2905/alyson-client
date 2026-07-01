/**
 * Usage: dotenv -e .env -- npx tsx scripts/diagnose-bot-transcripts.ts <botId>
 */
import { buildNotetakerLiveDiagnostics } from "../src/lib/notetaker-live-diagnostics.server";
import { linkBotToNotetakerSession } from "../src/lib/notetaker-bot-dispatch.server";
import { patchRecallBotRecordingConfig, resolveRecallTranscriptWebhookUrl } from "../src/lib/recall/recall-bot-config.server";
import { fetchRecallBotLifecycles } from "../src/lib/recall/recall-bot-status.server";
import { readUnifiedScheduledStateFromS3, unifiedScheduledStateUsesS3 } from "../src/lib/unified-scheduled-s3.server";
import { activateDueScheduledBotSessions } from "../src/lib/notetaker-scheduled-bot-activation.server";

const botId = process.argv[2]?.trim();
if (!botId) {
  console.error("Usage: dotenv -e .env -- npx tsx scripts/diagnose-bot-transcripts.ts <botId>");
  process.exit(1);
}

async function main() {
  console.log("=== Bot transcript diagnose ===");
  console.log("botId:", botId);
  console.log("transcriptWebhookUrl:", resolveRecallTranscriptWebhookUrl());
  console.log("");

  const lifeResult = await fetchRecallBotLifecycles([botId]);
  const lifecycle = lifeResult.lifecycles.get(botId);
  console.log("Recall lifecycle:", JSON.stringify(lifecycle, null, 2));

  const diag = await buildNotetakerLiveDiagnostics(botId);
  console.log("\nNotetaker diagnostics:", JSON.stringify(diag, null, 2));

  if (unifiedScheduledStateUsesS3()) {
    const state = await readUnifiedScheduledStateFromS3();
    const row = state.scheduled.find((r) => r.recallBotId === botId);
    console.log("\nS3 scheduled row:", row ? JSON.stringify(row, null, 2) : "(not found)");
  }

  console.log("\n--- Running activation cron logic ---");
  const activation = await activateDueScheduledBotSessions();
  console.log(JSON.stringify(activation, null, 2));

  if (diag.upstream.lineCount === 0 && rowNeedsRepair(diag)) {
    console.log("\n--- Attempting repair: patchRecall + linkBotToNotetakerSession ---");
    await patchRecallBotRecordingConfig(botId);
    const state = unifiedScheduledStateUsesS3() ? await readUnifiedScheduledStateFromS3() : null;
    const row = state?.scheduled.find((r) => r.recallBotId === botId);
    if (row) {
      await linkBotToNotetakerSession({
        botId,
        title: row.title || "Meeting",
        meetingUrl: row.meetingUrl,
        botJoinAt: row.botJoinAt,
        allowSessionWake: true,
        metadata: { source: "diagnose_repair" },
      });
    }
    const after = await buildNotetakerLiveDiagnostics(botId);
    console.log("\nAfter repair:", JSON.stringify(after, null, 2));
  }
}

function rowNeedsRepair(diag: Awaited<ReturnType<typeof buildNotetakerLiveDiagnostics>>): boolean {
  const s = String(diag.upstream.status || "").toLowerCase();
  return ["recording", "in_call", "in_call_recording", "joined", "waiting_room", "joining"].some((x) =>
    s.includes(x),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
