import type { MeetingListParticipant } from "@/lib/notetaker-meeting-ui";

const STORAGE_KEY = "alyson-meeting-list-participants";
const CACHE_TTL_MS = 30 * 60_000;

type CacheEntry = {
  participants: MeetingListParticipant[];
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

export function getCachedMeetingParticipants(prefix: string): MeetingListParticipant[] | null {
  const entry = readSession().byPrefix[prefix];
  if (!entry?.participants) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.participants;
}

export function loadCachedParticipantsForPrefixes(
  prefixes: string[],
): Record<string, MeetingListParticipant[]> {
  const session = readSession();
  const now = Date.now();
  const out: Record<string, MeetingListParticipant[]> = {};
  for (const prefix of prefixes) {
    const entry = session.byPrefix[prefix];
    if (!entry?.participants || now - entry.cachedAt > CACHE_TTL_MS) continue;
    out[prefix] = entry.participants;
  }
  return out;
}

export function saveMeetingParticipantsCache(
  prefix: string,
  participants: MeetingListParticipant[],
) {
  const session = readSession();
  session.byPrefix[prefix] = { participants, cachedAt: Date.now() };
  writeSession(session);
}

export function saveMeetingParticipantsCacheBatch(
  byPrefix: Record<string, MeetingListParticipant[]>,
) {
  const session = readSession();
  const now = Date.now();
  for (const [prefix, participants] of Object.entries(byPrefix)) {
    session.byPrefix[prefix] = { participants, cachedAt: now };
  }
  writeSession(session);
}
