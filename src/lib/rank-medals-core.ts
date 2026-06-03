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

/** Display-order rank 1…n; top 3 also get medal styling via medalTierForRank. */
export function timeDashboardRank(orderedRows: TimeDashboardRollup[]): Map<string, number> {
  const map = new Map<string, number>();
  orderedRows.forEach((r, i) => map.set(r.employee_id, i + 1));
  return map;
}

/**
 * Display-order rank 1…n for every row (same sort as the table).
 * Rows 1–3 show medal emojis; 4+ show #4, #5, …
 */
export function workspaceActivityRank(
  orderedRows: Array<{ userEmail: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  orderedRows.forEach((r, i) => map.set(r.userEmail, i + 1));
  return map;
}
