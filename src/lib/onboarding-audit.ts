import {
  ONBOARDING_COLUMNS,
  type OnboardingFieldChange,
  type OnboardingRow,
  type OnboardingRowEdit,
} from "@/lib/onboarding-schema";

function cellValue(v: unknown): string {
  return String(v ?? "").trim();
}

export function rowKey(row: OnboardingRow): string {
  return cellValue(row._rowId) || cellValue(row["Employee ID"]);
}

export function diffOnboardingRows(
  before: OnboardingRow[],
  after: OnboardingRow[],
): OnboardingRowEdit[] {
  const beforeMap = new Map(before.map((r) => [rowKey(r), r]));
  const edits: OnboardingRowEdit[] = [];

  for (const next of after) {
    const key = rowKey(next);
    if (!key) continue;
    const prev = beforeMap.get(key);
    if (!prev) continue;

    const changes: OnboardingFieldChange[] = [];
    for (const field of ONBOARDING_COLUMNS) {
      const from = cellValue(prev[field]);
      const to = cellValue(next[field]);
      if (from !== to) changes.push({ field, from, to });
    }

    if (changes.length) {
      edits.push({
        employeeId: key,
        employeeName: cellValue(next.Name) || cellValue(prev.Name),
        changes,
      });
    }
  }

  return edits;
}

export function summarizeRowEdit(edit: OnboardingRowEdit): string {
  const parts = edit.changes.map(
    (c) => `${c.field}: ${c.from || "(empty)"} → ${c.to || "(empty)"}`,
  );
  const who = edit.employeeName || edit.employeeId;
  return `${who} — ${parts.join("; ")}`;
}

export function summarizeRowEdits(edits: OnboardingRowEdit[]): string {
  if (!edits.length) return "No field changes detected";
  const fieldCount = edits.reduce((n, e) => n + e.changes.length, 0);
  if (edits.length === 1) return summarizeRowEdit(edits[0]!);
  return `Updated ${fieldCount} field(s) across ${edits.length} employees`;
}
