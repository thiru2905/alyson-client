function normalizeAlias(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resigned or inactive — excluded from speaker identity clustering and roster matching. */
export const SPEAKER_IDENTITY_EXCLUDED_NAMES = new Set(
  [
    "Ahsan Raza",
  ].map(normalizeAlias),
);

export const SPEAKER_IDENTITY_EXCLUDED_EMAILS = new Set(
  [
    "ahsan@revcloud.com",
    "malikahsanraza05@gmail.com",
  ].map((e) => e.toLowerCase()),
);

export type SpeakerEmailOverride = {
  canonicalName: string;
  email: string;
  /** Normalized name variants that should resolve to this person. */
  aliases: string[];
};

/** Authoritative transcript / meeting speaker → email mappings (checked before fuzzy roster match). */
export const SPEAKER_EMAIL_OVERRIDES: SpeakerEmailOverride[] = [
  {
    canonicalName: "Omer Affan",
    email: "omer@cintara.ai",
    aliases: ["omer affan", "omer"],
  },
  {
    canonicalName: "Ahsan Zafar",
    email: "ahsan@cintara.ai",
    aliases: ["ahsan zafar", "ahsan"],
  },
  {
    canonicalName: "Ahsan Javed",
    email: "ahsanjaved@cintara.ai",
    aliases: ["ahsan javed"],
  },
  {
    canonicalName: "Usama Mir",
    email: "usama@betterpeoplesupport.com",
    aliases: ["usama mir", "usama"],
  },
  {
    canonicalName: "Salman Soomro",
    email: "salman.soomro@cintara.ai",
    aliases: ["salman soomro", "salman somoro", "salman"],
  },
];

const overrideByAlias = new Map<string, SpeakerEmailOverride>();
for (const row of SPEAKER_EMAIL_OVERRIDES) {
  for (const alias of row.aliases) {
    overrideByAlias.set(normalizeAlias(alias), row);
  }
  overrideByAlias.set(normalizeAlias(row.canonicalName), row);
}

export function isSpeakerIdentityExcluded(entry: { name?: string; email?: string }): boolean {
  const name = normalizeAlias(entry.name ?? "");
  if (name && SPEAKER_IDENTITY_EXCLUDED_NAMES.has(name)) return true;

  const email = String(entry.email ?? "").trim().toLowerCase();
  if (email && SPEAKER_IDENTITY_EXCLUDED_EMAILS.has(email)) return true;

  return false;
}

export function findSpeakerEmailOverride(label: string): SpeakerEmailOverride | null {
  const norm = normalizeAlias(label);
  if (!norm) return null;
  return overrideByAlias.get(norm) ?? null;
}
