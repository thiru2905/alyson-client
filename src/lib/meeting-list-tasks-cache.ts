import type { MeetingListPersonTasks } from "@/lib/notetaker-meeting-ui";

const STORAGE_KEY = "alyson-meeting-list-tasks";
const CACHE_TTL_MS = 30 * 60_000;

type CacheEntry = {
  payload: {
    people: MeetingListPersonTasks[];
    model: string;
    generatedAt: string;
    warnings: string[];
  };
  cachedAt: number;
};

type SessionState = {
  version: 1;
  byPrefix: Record<string, CacheEntry>;
};

function readSession(): SessionState {
  if (typeof window === "undefined") return { version: 1, byPrefix: {} };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, byPrefix: {} };
    const parsed = JSON.parse(raw) as SessionState;
    if (parsed?.version !== 1 || !parsed.byPrefix) return { version: 1, byPrefix: {} };
    return parsed;
  } catch {
    return { version: 1, byPrefix: {} };
  }
}

function writeSession(state: SessionState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota or private mode
  }
}

export function getCachedMeetingTasks(prefix: string): CacheEntry["payload"] | null {
  const entry = readSession().byPrefix[prefix];
  if (!entry?.payload) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.payload;
}

export function saveMeetingTasksCache(prefix: string, payload: CacheEntry["payload"]) {
  const session = readSession();
  session.byPrefix[prefix] = { payload, cachedAt: Date.now() };
  writeSession(session);
}
