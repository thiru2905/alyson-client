import type { QueryClient } from "@tanstack/react-query";
import type { EmployeeScoringResponse } from "@/lib/employee-scoring-types";
import {
  loadEmployeeScoringSession,
  readEmployeeScoringSnapshot,
} from "@/lib/employee-scoring-session";
import type { WorkspaceActivityResponse } from "@/lib/workspace-activity-types";
import {
  loadWorkspaceActivitySession,
  readWorkspaceActivitySnapshot,
} from "@/lib/workspace-activity-session";
import {
  getCachedBotJoinReport,
  loadBotJoinReportSession,
} from "@/lib/bot-join-report-session";
import {
  getCachedRecallCostReport,
  loadRecallCostSession,
} from "@/lib/recall-cost-session";
import { DEFAULT_BOT_JOIN_REPORT_EMAIL } from "@/lib/notetaker-bot-join-report.types";

/** Heavy Google / TD / Notetaker reports — keep warm in memory; avoid refetch when switching modules. */
export const HEAVY_REPORT_STALE_MS = 60 * 60_000;
export const HEAVY_REPORT_GC_MS = 7 * 24 * 60 * 60_000;

export const heavyReportQueryOptions = {
  staleTime: HEAVY_REPORT_STALE_MS,
  gcTime: HEAVY_REPORT_GC_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

export function workspaceActivityQueryKey(applied: { start: string; end: string }) {
  return ["workspace-activity", applied.start, applied.end, "calendar"] as const;
}

export function employeeScoringQueryKey(applied: { start: string; end: string }) {
  return ["employee-scoring", applied.start, applied.end, "calendar-meetings"] as const;
}

export function botJoinReportQueryKey(args: {
  start: string;
  end: string;
  calendarEmail: string;
  windowHours?: number | null;
}) {
  return [
    "bot-join-report",
    args.start,
    args.end,
    args.calendarEmail,
    args.windowHours ?? null,
  ] as const;
}

export function recallCostReportQueryKey(args: { start: string; end: string }) {
  return ["recall-cost-report", args.start, args.end] as const;
}

/** Seed React Query from localStorage/sessionStorage so returning to a module is instant. */
export function hydrateHeavyReportQueries(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  const wsSession = loadWorkspaceActivitySession();
  if (wsSession?.applied) {
    const snapshot =
      readWorkspaceActivitySnapshot(wsSession.applied) ?? wsSession.snapshot;
    if (snapshot) {
      queryClient.setQueryData(workspaceActivityQueryKey(wsSession.applied), snapshot);
    }
  }

  const esSession = loadEmployeeScoringSession();
  if (esSession?.applied) {
    const snapshot =
      readEmployeeScoringSnapshot(esSession.applied) ?? esSession.snapshot;
    if (snapshot) {
      queryClient.setQueryData(employeeScoringQueryKey(esSession.applied), snapshot);
    }
  }

  const bjSession = loadBotJoinReportSession();
  if (bjSession?.applied) {
    const email = bjSession.calendarEmail || DEFAULT_BOT_JOIN_REPORT_EMAIL;
    const cached = getCachedBotJoinReport(
      email,
      bjSession.applied.start,
      bjSession.applied.end,
      bjSession.applied.windowHours,
    );
    if (cached) {
      queryClient.setQueryData(
        botJoinReportQueryKey({
          start: bjSession.applied.start,
          end: bjSession.applied.end,
          calendarEmail: email,
          windowHours: bjSession.applied.windowHours,
        }),
        { report: cached },
      );
    }
  }

  const costSession = loadRecallCostSession();
  if (costSession?.applied) {
    const cached = getCachedRecallCostReport(costSession.applied.start, costSession.applied.end);
    if (cached) {
      queryClient.setQueryData(
        recallCostReportQueryKey({
          start: costSession.applied.start,
          end: costSession.applied.end,
        }),
        { report: cached },
      );
    }
  }
}

export type { EmployeeScoringResponse, WorkspaceActivityResponse };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Default last-N-days range used by Bot Join / Meeting Cost when no session exists. */
export function defaultHeavyReportRange(days = 30) {
  const end = isoDay(new Date());
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { start: isoDay(startDate), end, periodDays: days };
}

/**
 * Warm React Query for Bot Join Report / Meeting Cost on nav hover so the first
 * click often hits cache (sessionStorage or in-flight prefetch).
 */
export function prefetchNotetakerHeavyReport(
  queryClient: QueryClient,
  path: string,
  fetchers: {
    botJoin: (args: {
      start: string;
      end: string;
      calendarEmail: string;
      windowHours?: number;
    }) => Promise<{ report: unknown }>;
    recallCost: (args: { start: string; end: string }) => Promise<{ report: unknown }>;
  },
) {
  if (path === "/alyson-notetaker/bot-join-report") {
    const session = loadBotJoinReportSession();
    const email = session?.calendarEmail || DEFAULT_BOT_JOIN_REPORT_EMAIL;
    const applied: {
      start: string;
      end: string;
      periodDays: number;
      windowHours?: number;
    } = session?.applied ?? defaultHeavyReportRange(30);
    const key = botJoinReportQueryKey({
      start: applied.start,
      end: applied.end,
      calendarEmail: email,
      windowHours: applied.windowHours,
    });
    if (queryClient.getQueryData(key)) return;
    const cached = getCachedBotJoinReport(
      email,
      applied.start,
      applied.end,
      applied.windowHours,
    );
    if (cached) {
      queryClient.setQueryData(key, { report: cached });
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: key,
      queryFn: () =>
        fetchers.botJoin({
          start: applied.start,
          end: applied.end,
          calendarEmail: email,
          windowHours: applied.windowHours,
        }),
      ...heavyReportQueryOptions,
      staleTime: applied.windowHours ? 5 * 60_000 : heavyReportQueryOptions.staleTime,
    });
    return;
  }

  if (path === "/alyson-notetaker/cost-tracking") {
    const session = loadRecallCostSession();
    const applied = session?.applied ?? defaultHeavyReportRange(30);
    const key = recallCostReportQueryKey({ start: applied.start, end: applied.end });
    if (queryClient.getQueryData(key)) return;
    const cached = getCachedRecallCostReport(applied.start, applied.end);
    if (cached) {
      queryClient.setQueryData(key, { report: cached });
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: key,
      queryFn: () => fetchers.recallCost({ start: applied.start, end: applied.end }),
      ...heavyReportQueryOptions,
    });
  }
}
