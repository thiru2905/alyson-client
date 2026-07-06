/**
 * Scan historical People Ops mail month-by-month.
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/backfill-leave-email.ts [--months=24] [--max=500]
 */
import { runLeaveEmailBackfill } from "../src/lib/leave-email-sync.server";

const monthsArg = process.argv.find((a) => a.startsWith("--months="));
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const monthsBack = monthsArg ? Number(monthsArg.split("=")[1]) : 24;
const maxPerMonth = maxArg ? Number(maxArg.split("=")[1]) : 500;

console.log(`Leave email backfill — ${monthsBack} months, up to ${maxPerMonth} emails/month\n`);

const result = await runLeaveEmailBackfill({ monthsBack, maxMessagesPerMonth: maxPerMonth });

console.log(`Scanned:           ${result.scanned}`);
console.log(`Applied:           ${result.applied}`);
console.log(`Needs attention:   ${result.queued}`);
console.log(`Skipped (seen):    ${result.skippedProcessed}`);
console.log(`Not leave:         ${result.notLeave}`);
console.log(`Unmatched:         ${result.unmatched}`);
console.log(`Duplicates:        ${result.duplicates}`);
if (result.errors.length) {
  console.log(`\nErrors (${result.errors.length}):`);
  for (const e of result.errors) console.log(`  - ${e}`);
}

process.exit(result.errors.length > 0 ? 1 : 0);
