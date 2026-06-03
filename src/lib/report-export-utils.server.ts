import * as XLSX from "xlsx";
import { toCSV } from "@/lib/csv";

export function emailToSlug(email: string) {
  const local = email.split("@")[0] || "employee";
  return local.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 48) || "employee";
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function csvBuffer(rows: Record<string, unknown>[], headers?: string[]) {
  return Buffer.from(toCSV(rows, headers), "utf8");
}

export function xlsxBuffer(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ note: "No data" }]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const HOURLY_EXPORT_HEADERS = [
  "day",
  "hour",
  "time_doctor_minutes",
  "active_minutes",
  "inactive_minutes",
  "meetings_attended",
  "chat_messages",
  "emails",
  "docs_created",
  "words_typed_or_spoken",
  "working",
  "hours_credit",
] as const;

export function hourlyRowsToRecords(
  rows: Array<{
    day: string;
    hour: number;
    timeDoctorMinutes: number;
    activeMinutes: number;
    inactiveMinutes: number;
    meetingsAttended: number;
    chatMessages: number;
    emails: number;
    docsCreated: number;
    wordsTypedOrSpoken: number;
    working: string;
    hoursCredit: number;
  }>,
) {
  return rows.map((r) => ({
    day: r.day,
    hour: r.hour,
    time_doctor_minutes: r.timeDoctorMinutes,
    active_minutes: r.activeMinutes,
    inactive_minutes: r.inactiveMinutes,
    meetings_attended: r.meetingsAttended,
    chat_messages: r.chatMessages,
    emails: r.emails,
    docs_created: r.docsCreated,
    words_typed_or_spoken: r.wordsTypedOrSpoken,
    working: r.working,
    hours_credit: r.hoursCredit,
  }));
}
