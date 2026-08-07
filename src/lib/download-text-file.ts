/** Trigger a browser download of plain text (notes / transcript export). */
export function downloadTextFile(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const body = String(text ?? "");
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Safe filename stem from a meeting title. */
export function meetingExportFilenameStem(title: string, fallback = "meeting"): string {
  const stem = String(title || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return stem || fallback;
}
