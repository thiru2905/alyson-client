import { OFFBOARDING_TASK_IDS, ONBOARDING_TASK_IDS, type BoardingStep } from "@/lib/boarding-spec";

const STORAGE_KEY = "alyson-hr-boarding-checklists-v1";

export type BoardingFlow = "onboarding" | "offboarding";

export type BoardingPersisted = {
  onboardingChecked: Record<string, boolean>;
  offboardingChecked: Record<string, boolean>;
  /** Optional label for the hire/exit being processed (not PII — user-entered note). */
  contextLabel: string;
};

function emptyRecord(ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, false]));
}

export function defaultPersisted(): BoardingPersisted {
  return {
    onboardingChecked: emptyRecord(ONBOARDING_TASK_IDS),
    offboardingChecked: emptyRecord(OFFBOARDING_TASK_IDS),
    contextLabel: "",
  };
}

function isRecordOfBooleans(v: unknown): v is Record<string, boolean> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === "boolean");
}

export function loadBoardingState(): BoardingPersisted {
  if (typeof window === "undefined") return defaultPersisted();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersisted();
    const parsed = JSON.parse(raw) as Partial<BoardingPersisted>;
    const base = defaultPersisted();
    const onboardingChecked =
      parsed.onboardingChecked && isRecordOfBooleans(parsed.onboardingChecked)
        ? { ...base.onboardingChecked, ...parsed.onboardingChecked }
        : base.onboardingChecked;
    const offboardingChecked =
      parsed.offboardingChecked && isRecordOfBooleans(parsed.offboardingChecked)
        ? { ...base.offboardingChecked, ...parsed.offboardingChecked }
        : base.offboardingChecked;
    const contextLabel = typeof parsed.contextLabel === "string" ? parsed.contextLabel : "";
    return { onboardingChecked, offboardingChecked, contextLabel };
  } catch {
    return defaultPersisted();
  }
}

export function saveBoardingState(next: BoardingPersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode */
  }
}

export function countCompleted(
  steps: BoardingStep[],
  checked: Record<string, boolean>,
): { done: number; total: number } {
  const total = steps.reduce((n, s) => n + s.tasks.length, 0);
  const done = steps.reduce(
    (n, s) => n + s.tasks.reduce((m, t) => m + (checked[t.id] ? 1 : 0), 0),
    0,
  );
  return { done, total };
}
