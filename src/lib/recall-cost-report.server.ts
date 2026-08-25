import {
  fetchRecallBotUsage,
  recallBotHourRateUsd,
  recallTranscriptHourRateUsd,
  recallUsageCostsFromSeconds,
} from "@/lib/recall/recall-billing.server";
import { listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";
import { listMeetingsFromS3 } from "@/lib/notetaker-s3-calendar.server";
import { readUnifiedScheduledStateFromS3 } from "@/lib/unified-scheduled-s3.server";

export type RecallCostDailyRow = {
  day: string;
  botSeconds: number;
  botHours: number;
  botCostUsd: number;
  transcriptCostUsd: number;
  totalCostUsd: number;
  meetings: number;
  costPerMeetingUsd: number | null;
  /** True when bot seconds are allocated from period total (no per-day Recall API call). */
  estimated: boolean;
};

export type RecallCostByUserRow = {
  email: string;
  meetings: number;
  withBot: number;
  estimatedCostUsd: number;
  shareOfTotal: number | null;
};

export type RecallCostByMeetingRow = {
  day: string;
  title: string;
  botId: string | null;
  prefix: string;
  userEmail: string;
  estimatedCostUsd: number;
};

export type RecallCostByUserMonthRow = {
  month: string;
  email: string;
  meetings: number;
  estimatedCostUsd: number;
};

export type RecallCostReport = {
  range: { start: string; end: string };
  generatedAt: string;
  recallConfigured: boolean;
  /** Set when Recall billing API failed for the selected period. */
  billingFetchError?: string | null;
  /** Recall dashboard may also include storage, variants, DSDK — not in bot_total API. */
  storageAndExtrasNotIncluded: boolean;
  /** Daily bot/cost split is estimated from period total + meeting counts (Recall allows 5 billing calls/min). */
  dailyCostsEstimated: boolean;
  usage: {
    botTotalSeconds: number;
    botTotalHours: number;
    botUsageCostUsd: number;
    transcriptUsageCostUsd: number;
    totalUsageCostUsd: number;
  };
  meetings: {
    total: number;
    /** S3 meetings linked to a Recall bot id. */
    withBot: number;
    withTranscript: number;
    withNotes: number;
    botsCreated: number;
  };
  costs: {
    botUsageCostUsd: number;
    transcriptUsageCostUsd: number;
    totalUsageCostUsd: number;
    /** Total cost ÷ S3 meeting count (includes non-Recall assets). */
    costPerMeetingUsd: number | null;
    /** Total cost ÷ meetings with a Recall bot id. */
    costPerRecallMeetingUsd: number | null;
    botHourRateUsd: number;
    transcriptHourRateUsd: number;
    combinedHourRateUsd: number;
  };
  calendarMonth: {
    start: string;
    end: string;
    botTotalSeconds: number;
    botTotalHours: number;
    botUsageCostUsd: number;
    transcriptUsageCostUsd: number;
    totalUsageCostUsd: number;
    meetings: number;
    withBot: number;
    costPerMeetingUsd: number | null;
    costPerRecallMeetingUsd: number | null;
  };
  daily: RecallCostDailyRow[];
  /** Period cost rolled up by calendar owner who scheduled the bot. */
  byUser: RecallCostByUserRow[];
  /** Per-meeting estimated cost (capped for UI). */
  byMeeting: RecallCostByMeetingRow[];
  /** Period cost by calendar owner × calendar month. */
  byUserMonth: RecallCostByUserMonthRow[];
  warnings: string[];
};

const BY_MEETING_UI_CAP = 150;
const UNKNOWN_USER = "unknown";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00Z`);
  const endMs = new Date(`${end}T12:00:00Z`).getTime();
  while (cur.getTime() <= endMs) {
    out.push(isoDay(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function calendarMonthRange(today = isoDay(new Date())) {
  const d = new Date(`${today}T12:00:00Z`);
  const start = isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  return { start, end: today };
}

function meetingDay(doc: { finalizedAt?: string; cronFinalizedAt?: string; prefix?: string }): string | null {
  const anchor = String(doc.finalizedAt || doc.cronFinalizedAt || "").trim();
  if (anchor && Number.isFinite(Date.parse(anchor))) return anchor.slice(0, 10);
  const parts = String(doc.prefix || "").split("_");
  const date = parts.length >= 2 ? parts[parts.length - 2] : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

async function loadBotCalendarEmailById(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const state = await readUnifiedScheduledStateFromS3();
    for (const row of state.scheduled ?? []) {
      const botId = String(row.recallBotId || "").trim();
      const email = String(row.calendarUserEmail || "").trim().toLowerCase();
      if (botId && email) out.set(botId, email);
    }
  } catch {
    // Optional — breakdowns fall back to "unknown"
  }
  return out;
}

function buildCostBreakdowns(args: {
  meetings: Array<{
    day: string;
    title: string;
    botId: string | null;
    prefix: string;
  }>;
  totalUsageCostUsd: number;
  emailByBotId: Map<string, string>;
}): {
  byUser: RecallCostByUserRow[];
  byMeeting: RecallCostByMeetingRow[];
  byUserMonth: RecallCostByUserMonthRow[];
} {
  const withBot = args.meetings.filter((m) => m.botId);
  const costPerRecallMeeting =
    withBot.length > 0 ? args.totalUsageCostUsd / withBot.length : 0;

  const byMeetingAll: RecallCostByMeetingRow[] = args.meetings.map((m) => {
    const botId = m.botId ? String(m.botId).trim() : null;
    const userEmail = botId ? args.emailByBotId.get(botId) || UNKNOWN_USER : UNKNOWN_USER;
    return {
      day: m.day,
      title: m.title || "Meeting",
      botId,
      prefix: m.prefix,
      userEmail,
      estimatedCostUsd: botId ? costPerRecallMeeting : 0,
    };
  });

  byMeetingAll.sort((a, b) => {
    if (b.estimatedCostUsd !== a.estimatedCostUsd) return b.estimatedCostUsd - a.estimatedCostUsd;
    return b.day.localeCompare(a.day);
  });

  const userAgg = new Map<string, { meetings: number; withBot: number; estimatedCostUsd: number }>();
  const monthAgg = new Map<string, { meetings: number; estimatedCostUsd: number }>();

  for (const row of byMeetingAll) {
    const u = userAgg.get(row.userEmail) ?? { meetings: 0, withBot: 0, estimatedCostUsd: 0 };
    u.meetings += 1;
    if (row.botId) u.withBot += 1;
    u.estimatedCostUsd += row.estimatedCostUsd;
    userAgg.set(row.userEmail, u);

    const month = row.day.slice(0, 7);
    const key = `${month}|${row.userEmail}`;
    const m = monthAgg.get(key) ?? { meetings: 0, estimatedCostUsd: 0 };
    m.meetings += 1;
    m.estimatedCostUsd += row.estimatedCostUsd;
    monthAgg.set(key, m);
  }

  const total = args.totalUsageCostUsd;
  const byUser: RecallCostByUserRow[] = [...userAgg.entries()]
    .map(([email, v]) => ({
      email,
      meetings: v.meetings,
      withBot: v.withBot,
      estimatedCostUsd: v.estimatedCostUsd,
      shareOfTotal: total > 0 ? v.estimatedCostUsd / total : null,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const byUserMonth: RecallCostByUserMonthRow[] = [...monthAgg.entries()]
    .map(([key, v]) => {
      const sep = key.indexOf("|");
      return {
        month: key.slice(0, sep),
        email: key.slice(sep + 1),
        meetings: v.meetings,
        estimatedCostUsd: v.estimatedCostUsd,
      };
    })
    .sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return b.estimatedCostUsd - a.estimatedCostUsd;
    });

  return {
    byUser,
    byMeeting: byMeetingAll.slice(0, BY_MEETING_UI_CAP),
    byUserMonth,
  };
}

/** Split period bot seconds across days proportional to meeting count (no per-day Recall API). */
function allocateDailyBotSeconds(
  days: string[],
  totalSeconds: number,
  meetingsByDay: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of days) out.set(day, 0);
  if (totalSeconds <= 0) return out;

  const totalMeetings = days.reduce((s, d) => s + (meetingsByDay.get(d) ?? 0), 0);
  if (totalMeetings <= 0) return out;

  let allocated = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const meetings = meetingsByDay.get(day) ?? 0;
    if (i === days.length - 1) {
      out.set(day, Math.max(0, totalSeconds - allocated));
      continue;
    }
    const share = Math.round((totalSeconds * meetings) / totalMeetings);
    out.set(day, share);
    allocated += share;
  }
  return out;
}

async function fetchUsageSeconds(
  startDay: string,
  endDay: string,
): Promise<{ seconds: number; error: string | null }> {
  try {
    const usage = await fetchRecallBotUsage({ startDay, endDay });
    return { seconds: Number(usage.bot_total ?? 0), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { seconds: 0, error: msg };
  }
}

export async function buildRecallCostReport(args: {
  start: string;
  end: string;
}): Promise<RecallCostReport> {
  const recallConfigured = Boolean(process.env.RECALL_API_KEY?.trim());
  const botHourRateUsd = recallBotHourRateUsd();
  const transcriptHourRateUsd = recallTranscriptHourRateUsd();

  const [botIndexDocs, s3Meetings, emailByBotId] = await Promise.all([
    listAllBotIndexDocs(),
    listMeetingsFromS3({ start: args.start, end: args.end }),
    loadBotCalendarEmailById(),
  ]);

  const meetingsInRange = s3Meetings.filter((m) => m.day >= args.start && m.day <= args.end);
  const botsInRange = botIndexDocs.filter((doc) => {
    const day = meetingDay(doc);
    return day && day >= args.start && day <= args.end;
  });

  const month = calendarMonthRange();
  const periodKey = `${args.start}:${args.end}`;
  const monthKey = `${month.start}:${month.end}`;

  let botTotalSeconds = 0;
  let monthBotSeconds = 0;
  let billingFetchError: string | null = null;
  const warnings: string[] = [];

  if (recallConfigured) {
    // At most 2 Recall billing API calls per report (period + month if different range).
    const periodUsage = await fetchUsageSeconds(args.start, args.end);
    botTotalSeconds = periodUsage.seconds;
    if (periodUsage.error) {
      billingFetchError = periodUsage.error;
      warnings.push(`Recall billing API (period): ${periodUsage.error}`);
    }
    if (periodKey === monthKey) {
      monthBotSeconds = botTotalSeconds;
    } else {
      const monthUsage = await fetchUsageSeconds(month.start, month.end);
      monthBotSeconds = monthUsage.seconds;
      if (monthUsage.error) {
        warnings.push(`Recall billing API (calendar month): ${monthUsage.error}`);
      }
    }
  } else {
    warnings.push("RECALL_API_KEY not set — bot hours and USD totals are zero.");
  }

  warnings.push(
    "Totals use Recall bot_total seconds × configured hourly rates. Recall dashboard credits may also include media storage, bot variants (web_4_core/web_gpu), and DSDK — not returned by the billing usage API.",
  );
  warnings.push(
    "Cost / user and cost / meeting splits allocate period Recall spend evenly across S3 meetings that have a Recall bot id (calendar owner from Unified Schedule when known).",
  );

  const periodCosts = recallUsageCostsFromSeconds(botTotalSeconds);
  const meetingCount = meetingsInRange.length;
  const meetingsWithBot = meetingsInRange.filter((m) => m.botId).length;
  const costPerMeetingUsd =
    meetingCount > 0 ? periodCosts.totalUsageCostUsd / meetingCount : null;
  const costPerRecallMeetingUsd =
    meetingsWithBot > 0 ? periodCosts.totalUsageCostUsd / meetingsWithBot : null;

  const meetingsByDay = new Map<string, number>();
  for (const m of meetingsInRange) {
    meetingsByDay.set(m.day, (meetingsByDay.get(m.day) ?? 0) + 1);
  }

  const dayList = daysBetweenInclusive(args.start, args.end);
  const dailyUsage = allocateDailyBotSeconds(dayList, botTotalSeconds, meetingsByDay);

  const daily: RecallCostDailyRow[] = dayList.map((day) => {
    const botSeconds = dailyUsage.get(day) ?? 0;
    const meetings = meetingsByDay.get(day) ?? 0;
    const dayCosts = recallUsageCostsFromSeconds(botSeconds);
    return {
      day,
      botSeconds,
      botHours: botSeconds / 3600,
      botCostUsd: dayCosts.botUsageCostUsd,
      transcriptCostUsd: dayCosts.transcriptUsageCostUsd,
      totalCostUsd: dayCosts.totalUsageCostUsd,
      meetings,
      costPerMeetingUsd: meetings > 0 ? dayCosts.totalUsageCostUsd / meetings : null,
      estimated: true,
    };
  });

  const monthCosts = recallUsageCostsFromSeconds(monthBotSeconds);
  const monthMeetingsInRange = s3Meetings.filter((m) => m.day >= month.start && m.day <= month.end);
  const monthMeetings = monthMeetingsInRange.length;
  const monthMeetingsWithBot = monthMeetingsInRange.filter((m) => m.botId).length;
  const combinedHourRateUsd = botHourRateUsd + transcriptHourRateUsd;

  const { byUser, byMeeting, byUserMonth } = buildCostBreakdowns({
    meetings: meetingsInRange.map((m) => ({
      day: m.day,
      title: m.title,
      botId: m.botId,
      prefix: m.prefix,
    })),
    totalUsageCostUsd: periodCosts.totalUsageCostUsd,
    emailByBotId,
  });

  return {
    range: { start: args.start, end: args.end },
    generatedAt: new Date().toISOString(),
    recallConfigured,
    billingFetchError,
    storageAndExtrasNotIncluded: true,
    dailyCostsEstimated: true,
    usage: {
      botTotalSeconds,
      botTotalHours: botTotalSeconds / 3600,
      botUsageCostUsd: periodCosts.botUsageCostUsd,
      transcriptUsageCostUsd: periodCosts.transcriptUsageCostUsd,
      totalUsageCostUsd: periodCosts.totalUsageCostUsd,
    },
    meetings: {
      total: meetingCount,
      withBot: meetingsWithBot,
      withTranscript: meetingsInRange.filter((m) => m.hasTranscript).length,
      withNotes: meetingsInRange.filter((m) => m.hasNotes).length,
      botsCreated: botsInRange.length,
    },
    costs: {
      botUsageCostUsd: periodCosts.botUsageCostUsd,
      transcriptUsageCostUsd: periodCosts.transcriptUsageCostUsd,
      totalUsageCostUsd: periodCosts.totalUsageCostUsd,
      costPerMeetingUsd,
      costPerRecallMeetingUsd,
      botHourRateUsd,
      transcriptHourRateUsd,
      combinedHourRateUsd,
    },
    calendarMonth: {
      start: month.start,
      end: month.end,
      botTotalSeconds: monthBotSeconds,
      botTotalHours: monthBotSeconds / 3600,
      botUsageCostUsd: monthCosts.botUsageCostUsd,
      transcriptUsageCostUsd: monthCosts.transcriptUsageCostUsd,
      totalUsageCostUsd: monthCosts.totalUsageCostUsd,
      meetings: monthMeetings,
      withBot: monthMeetingsWithBot,
      costPerMeetingUsd: monthMeetings > 0 ? monthCosts.totalUsageCostUsd / monthMeetings : null,
      costPerRecallMeetingUsd:
        monthMeetingsWithBot > 0 ? monthCosts.totalUsageCostUsd / monthMeetingsWithBot : null,
    },
    daily,
    byUser,
    byMeeting,
    byUserMonth,
    warnings,
  };
}
