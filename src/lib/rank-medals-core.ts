export type MedalTier = "gold" | "silver" | "bronze" | null;

export function medalTierForRank(rank: number): MedalTier {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

/** Cute medal emoji for UI / PDF text (top 3 only). */
export function medalEmojiForRank(rank: number): string | null {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

export const MEDAL_ROW_RGB: Record<"gold" | "silver" | "bronze", [number, number, number]> = {
  gold: [255, 251, 235],
  silver: [248, 250, 252],
  bronze: [255, 247, 237],
};

export const MEDAL_FILL_RGB: Record<"gold" | "silver" | "bronze", [number, number, number]> = {
  gold: [251, 191, 36],
  silver: [148, 163, 184],
  bronze: [234, 88, 12],
};

export const MEDAL_RIBBON_RGB: Record<"gold" | "silver" | "bronze", [number, number, number]> = {
  gold: [217, 119, 6],
  silver: [100, 116, 139],
  bronze: [194, 65, 12],
};

export type TimeDashboardRollup = {
  employee_id: string;
  rangeSeconds: number;
  dailySeconds: number;
  weeklySeconds: number;
  monthlySeconds: number;
};

export function timeDashboardMetricSeconds(
  row: TimeDashboardRollup,
  sortBy: "range" | "daily" | "weekly" | "monthly" | "name",
): number {
  switch (sortBy) {
    case "daily":
      return row.dailySeconds;
    case "weekly":
      return row.weeklySeconds;
    case "monthly":
      return row.monthlySeconds;
    case "name":
    case "range":
    default:
      return row.rangeSeconds;
  }
}

/** Top 3 medals for Time Dashboard — highest values for the active sort column (period when sorted by name). */
export function timeDashboardRank(
  rows: TimeDashboardRollup[],
  sortBy: "range" | "daily" | "weekly" | "monthly" | "name",
): Map<string, number> {
  const metric = sortBy === "name" ? "range" : sortBy;
  const sorted = [...rows].sort(
    (a, b) =>
      timeDashboardMetricSeconds(b, metric) - timeDashboardMetricSeconds(a, metric) ||
      a.employee_id.localeCompare(b.employee_id),
  );
  const map = new Map<string, number>();
  sorted.slice(0, 3).forEach((r, i) => map.set(r.employee_id, i + 1));
  return map;
}

export function workspaceActivityRank(
  rows: Array<{
    userEmail: string;
    emailsSent: number;
    meetingsCreated: number;
    docsCreated: number;
    chatMessagesSent: number;
  }>,
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const ta = a.emailsSent + a.meetingsCreated + a.docsCreated + a.chatMessagesSent;
    const tb = b.emailsSent + b.meetingsCreated + b.docsCreated + b.chatMessagesSent;
    return tb - ta || b.emailsSent - a.emailsSent;
  });
  const map = new Map<string, number>();
  sorted.forEach((r, i) => map.set(r.userEmail, i + 1));
  return map;
}
