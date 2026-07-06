import { subMonths } from "date-fns";
import { listLeaveEmailMessages, probeLeaveEmailMailbox } from "../src/lib/leave-email-gmail.server";

const probe = await probeLeaveEmailMailbox();
console.log("probe:", probe);

if (probe.ok) {
  const msgs = await listLeaveEmailMessages({
    after: subMonths(new Date(), 6),
    maxResults: 8,
  });
  console.log(`\nLast ${msgs.length} messages (6 mo):`);
  for (const m of msgs) {
    console.log(`  ${m.receivedAt.slice(0, 10)} | ${m.fromName} | ${m.subject}`);
  }
}
