import type { AlysonBrainDashboardPayload, AlysonBrainInsights } from "@/lib/alyson-brain/alyson-brain-types";
import { readReportSnapshot, writeReportSnapshot } from "@/lib/report-snapshot-store";

export const ALYSON_BRAIN_STORAGE_KEY = "alyson-brain-session";
const ALYSON_BRAIN_INDEX_KEY = "alyson-brain-snapshots";
const ALYSON_BRAIN_DATA_PREFIX = "alyson-brain";

export type AlysonBrainSnapshot = {
  question: string;
  dashboard: AlysonBrainDashboardPayload;
  insights: AlysonBrainInsights | null;
};

export type AlysonBrainStoredState = {
  version: 1;
  question: string;
  inputDraft: string;
  snapshotKey: string;
  snapshotAt: number;
};

export function alysonBrainSnapshotKey(question: string) {
  return question.trim().toLowerCase();
}

export function loadAlysonBrainSession(): AlysonBrainStoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ALYSON_BRAIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AlysonBrainStoredState;
    if (parsed?.version !== 1 || !parsed.question?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readAlysonBrainSnapshot(question: string | null): AlysonBrainSnapshot | undefined {
  if (!question?.trim()) return undefined;
  const key = alysonBrainSnapshotKey(question);
  return readReportSnapshot<AlysonBrainSnapshot>({
    indexKey: ALYSON_BRAIN_INDEX_KEY,
    dataPrefix: ALYSON_BRAIN_DATA_PREFIX,
    snapshotKey: key,
  });
}

export function saveAlysonBrainSession(args: {
  question: string;
  inputDraft: string;
  dashboard: AlysonBrainDashboardPayload | null;
  insights: AlysonBrainInsights | null;
}) {
  if (typeof window === "undefined") return;
  const question = args.question.trim();
  if (!question || !args.dashboard) return;

  const snapshotKey = alysonBrainSnapshotKey(question);
  const snapshotAt = Date.now();

  writeReportSnapshot({
    indexKey: ALYSON_BRAIN_INDEX_KEY,
    dataPrefix: ALYSON_BRAIN_DATA_PREFIX,
    snapshotKey,
    data: {
      question,
      dashboard: args.dashboard,
      insights: args.insights,
    },
  });

  try {
    const state: AlysonBrainStoredState = {
      version: 1,
      question,
      inputDraft: args.inputDraft,
      snapshotKey,
      snapshotAt,
    };
    localStorage.setItem(ALYSON_BRAIN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function clearAlysonBrainSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ALYSON_BRAIN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
