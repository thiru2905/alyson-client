/**
 * Usage: dotenv -e .env -- npx tsx scripts/check-meeting-bot.ts <meetingUrlOrId>
 */
import { readUnifiedScheduledStateFromS3 } from "../src/lib/unified-scheduled-s3.server";
import { listRecallBotsInJoinRange, fetchRecallBotLifecycle } from "../src/lib/recall/recall-bot-status.server";
import { getNotetakerSessionsIndexFromS3 } from "../src/lib/notetaker-sessions-s3.server";
import { listAllBotIndexDocs } from "../src/lib/notetaker-sessions-history.server";

const raw = process.argv[2]?.trim();
const days = Number(process.argv[3] || "14");
if (!raw) {
  console.error("Usage: dotenv -e .env -- npx tsx scripts/check-meeting-bot.ts <meetingUrlOrId>");
  process.exit(1);
}

const needle = raw.includes("zoom.us") ? raw.match(/\/j\/(\d+)/)?.[1] || raw : raw;

function matchUrl(url?: string | null) {
  const u = String(url || "").toLowerCase();
  return u.includes(String(needle).toLowerCase());
}

async function main() {
  console.log("Needle:", needle);
  console.log("");

  const state = await readUnifiedScheduledStateFromS3();
  const scheduled = state.scheduled.filter((r) => matchUrl(r.meetingUrl));
  const zoomAll = state.scheduled.filter((r) => String(r.meetingUrl || "").toLowerCase().includes("zoom"));
  console.log("=== S3 unified-scheduled ===");
  console.log(`total scheduled rows: ${state.scheduled.length}, zoom rows: ${zoomAll.length}`);
  if (zoomAll.length) {
    console.log("zoom scheduled entries:");
    for (const r of zoomAll) {
      console.log(`- ${r.title} | ${r.status} | ${r.recallBotId} | ${r.meetingUrl}`);
    }
  }
  console.log(scheduled.length ? JSON.stringify(scheduled, null, 2) : "(none matching needle)");

  const sessionsIndex = await getNotetakerSessionsIndexFromS3();
  const sessionHits = sessionsIndex.sessions.filter((s) => matchUrl(s.meetingUrl));
  console.log("\n=== S3 sessions index ===");
  console.log(sessionHits.length ? JSON.stringify(sessionHits, null, 2) : "(none)");

  const botIdsFromState = new Set(scheduled.map((r) => r.recallBotId).filter(Boolean));
  const botIndex = await listAllBotIndexDocs();
  const indexHits = botIndex.filter((d) => botIdsFromState.has(d.botId));
  console.log("\n=== S3 bot-index (linked to scheduled rows) ===");
  console.log(indexHits.length ? JSON.stringify(indexHits, null, 2) : "(none)");

  const now = Date.now();
  const after = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const before = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`\n=== Recall list (${days}d window) ===`);
  const listed = await listRecallBotsInJoinRange({ joinAtAfter: after, joinAtBefore: before });
  const recallHits = listed.filter((bot) => {
    const o = (bot && typeof bot === "object" ? bot : {}) as Record<string, unknown>;
    return matchUrl(String(o.meeting_url || o.meetingUrl || ""));
  });
  if (!recallHits.length) {
    console.log(`(none in ${days}d — try widening if meeting was older)`);
  } else {
    for (const bot of recallHits) {
      const o = bot as Record<string, unknown>;
      const id = String(o.id || o.bot_id || "");
      const lc = await fetchRecallBotLifecycle(id);
      console.log(
        JSON.stringify(
          {
            botId: id,
            meeting_url: o.meeting_url || o.meetingUrl,
            join_at: o.join_at,
            joinedMeeting: lc.joinedMeeting,
            finalStatusCode: lc.finalStatusCode,
            waitingRoomSeconds: lc.waitingRoomSeconds,
            stuckInWaitingRoom: lc.stuckInWaitingRoom,
            fatalSubCode: lc.fatalSubCode,
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
