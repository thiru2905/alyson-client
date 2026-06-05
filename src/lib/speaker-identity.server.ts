import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import {
  buildSpeakerIdentityIndex,
  EMPTY_SPEAKER_IDENTITY_INDEX,
  type SpeakerIdentityIndex,
} from "@/lib/speaker-identity";

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; index: SpeakerIdentityIndex; warnings: string[] } | null = null;

export async function getSpeakerIdentityIndex(): Promise<{
  index: SpeakerIdentityIndex;
  warnings: string[];
}> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { index: cache.index, warnings: cache.warnings };
  }

  try {
    const roster = await loadEmployeePickerDirectory();
    const index = buildSpeakerIdentityIndex(roster.employees);
    cache = { at: Date.now(), index, warnings: roster.warnings.slice(0, 4) };
    return { index, warnings: cache.warnings };
  } catch (e) {
    return {
      index: EMPTY_SPEAKER_IDENTITY_INDEX,
      warnings: [`speaker_identity: ${String(e)}`],
    };
  }
}
