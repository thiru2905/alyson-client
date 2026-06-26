/** Tiny CSV builder + browser download. No deps. */

/** UTF-8 BOM breaks strict parsers (e.g. n8n) — first column becomes "\uFEFFemail" instead of "email". */
const UTF8_BOM = "\uFEFF";

export function stripUtf8Bom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
}

export function toCSV(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0) return stripUtf8Bom(headers?.join(",") ?? "");
  const cols = (headers ?? Object.keys(rows[0])).map((h) => stripUtf8Bom(String(h)));
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return stripUtf8Bom(`${head}\n${body}`);
}

export function downloadCSV(filename: string, rows: Record<string, any>[], headers?: string[]) {
  const csv = toCSV(rows, headers);
  // UTF-8 without BOM — required for n8n / script column matching on the first header.
  const bytes = new TextEncoder().encode(csv);
  const blob = new Blob([bytes], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
