import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import { attachManagerToPacingRow } from "@/lib/org-chart-roster";
import type { OrgChartRosterLookup } from "@/lib/org-chart-roster";

export type TimeDoctorLeaveUser = {
  id: string;
  name: string;
  email: string;
  title?: string;
};

function findExistingLedgerByEmail(
  existing: Record<string, EmployeeLeaveLedger>,
  email: string,
): EmployeeLeaveLedger | null {
  const targetKeys = collectEmailKeys(email);
  for (const ledger of Object.values(existing)) {
    const ledgerKeys = collectEmailKeys(ledger.officialEmail);
    for (const tk of targetKeys) {
      if (ledgerKeys.has(tk)) return ledger;
    }
  }
  return null;
}

function collectEmailKeys(email: string): Set<string> {
  const keys = new Set<string>();
  for (const k of emailLookupKeys(email)) {
    keys.add(k);
    if (k.includes("@")) keys.add(canonicalOfficialEmail(k));
  }
  return keys;
}

/** Build leave ledgers from Time Doctor users (same roster/emails as Time Dashboard). */
export function syncLeaveLedgersWithTimeDoctor(
  users: TimeDoctorLeaveUser[],
  existing: Record<string, EmployeeLeaveLedger>,
  rosterLookup: OrgChartRosterLookup,
): Record<string, EmployeeLeaveLedger> {
  const next: Record<string, EmployeeLeaveLedger> = {};
  const seenIds = new Set<string>();
  const activeTdEmailKeys = new Set<string>();

  for (const u of users) {
    const email = String(u.email || "").trim();
    if (!email || !u.id) continue;

    seenIds.add(u.id);
    for (const k of collectEmailKeys(email)) activeTdEmailKeys.add(k);

    const meta = attachManagerToPacingRow({ email, name: u.name }, rosterLookup);
    const prior = existing[u.id] ?? findExistingLedgerByEmail(existing, email);
    const now = new Date().toISOString();

    next[u.id] = {
      employeeId: u.id,
      employeeName: String(u.name || email).trim() || email,
      officialEmail: email,
      jobTitle: String(u.title ?? prior?.jobTitle ?? "").trim(),
      team: meta.team?.trim() || prior?.team?.trim() || "",
      location: meta.location?.trim() || prior?.location?.trim() || "",
      active: true,
      leaveEvents: prior?.leaveEvents ?? [],
      updatedAt: prior?.updatedAt ?? now,
    };
  }

  for (const [id, ledger] of Object.entries(existing)) {
    if (seenIds.has(id)) continue;
    const keys = collectEmailKeys(ledger.officialEmail);
    const migrated = [...keys].some((k) => activeTdEmailKeys.has(k));
    if (migrated) continue;
    next[id] = { ...ledger, active: false };
  }

  return next;
}

export function timeDoctorUserIds(users: TimeDoctorLeaveUser[]): Set<string> {
  return new Set(users.map((u) => u.id).filter(Boolean));
}
