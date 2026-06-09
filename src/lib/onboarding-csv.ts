import {
  ONBOARDING_COLUMNS,
  type OnboardingColumn,
  type OnboardingRow,
} from "@/lib/onboarding-schema";

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function rowIdFor(raw: Record<string, string>): string {
  const id = norm(raw["Employee ID"]);
  if (id) return id;
  const email = norm(raw["Official Email"]) || norm(raw["Personal Email"]);
  if (email) return `onb_${email.toLowerCase()}`;
  const name = norm(raw.Name);
  return `onb_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "row"}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse onboarding roster CSV (header row + data rows). */
export function parseOnboardingCsv(csv: string): OnboardingRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const header = lines[0]!.split(",").map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out: OnboardingRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const raw: Record<string, string> = {};
    let hasContent = false;

    for (const col of ONBOARDING_COLUMNS) {
      const v = norm(cols[idx[col] ?? -1] ?? "");
      raw[col] = v;
      if (v) hasContent = true;
    }

    if (!hasContent) continue;

    const id = rowIdFor(raw);
    if (!raw["Employee ID"]) raw["Employee ID"] = id;

    const row = { _rowId: id } as OnboardingRow;
    for (const col of ONBOARDING_COLUMNS) {
      row[col as OnboardingColumn] = raw[col] ?? "";
    }
    out.push(row);
  }

  return out;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Serialize onboarding rows to CSV (Org Chart Sheet1 column order). */
export function serializeOnboardingCsv(
  rows: OnboardingRow[],
  columns: readonly string[] = ONBOARDING_COLUMNS,
): string {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(String(row[col as OnboardingColumn] ?? ""))).join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadOnboardingCsv(
  rows: OnboardingRow[],
  filename: string,
  columns: readonly string[] = ONBOARDING_COLUMNS,
) {
  const csv = serializeOnboardingCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
