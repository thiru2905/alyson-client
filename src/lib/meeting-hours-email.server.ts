import { SUPER_ACCESS_EMAILS } from "@/lib/super-access-constants";
import {
  buildMeetingHoursReport,
  type MeetingHoursEmployeeRow,
  type MeetingHoursReport,
} from "@/lib/meeting-hours-report.server";
import { getSesFromAddress, sendSesEmail, sesConfigured } from "@/lib/ses-mail.server";

const DEFAULT_REPORT_DAYS = 7;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseEmailList(raw: string | undefined): string[] {
  return [...new Set(String(raw || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export function meetingHoursReportRecipients(): string[] {
  const fromEnv = parseEmailList(process.env.MEETING_HOURS_REPORT_RECIPIENTS);
  if (fromEnv.length) return fromEnv;
  return [...SUPER_ACCESS_EMAILS];
}

export function meetingHoursReportDays(): number {
  const n = Number(process.env.MEETING_HOURS_REPORT_DAYS || String(DEFAULT_REPORT_DAYS));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_REPORT_DAYS;
  return Math.min(31, Math.max(1, Math.round(n)));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function meetingHoursReportRange(days = meetingHoursReportDays()): { start: string; end: string } {
  const end = isoDay(new Date());
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { start: isoDay(startDate), end };
}

function formatDayHeader(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatRangeLabel(start: string, end: string): string {
  if (start === end) return formatDayHeader(start);
  return `${formatDayHeader(start)} – ${formatDayHeader(end)}`;
}

function formatHours(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n < 10 ? `${n.toFixed(1)}h` : `${Math.round(n * 10) / 10}h`;
}

function dayCellHtml(hours: number): string {
  if (hours <= 0) {
    return `<span style="color:#9ca3af;">—</span>`;
  }
  return `<div style="font-weight:600;">${esc(formatHours(hours))}</div>`;
}

function employeeRowHtml(row: MeetingHoursEmployeeRow, days: string[]): string {
  const dayCells = days
    .map((day) => {
      const cell = row.days.find((d) => d.day === day) ?? { meetingCount: 0, hours: 0 };
      return `<td style="padding:6px 4px;text-align:center;border-bottom:1px solid #f3f4f6;vertical-align:top;">${dayCellHtml(cell.hours)}</td>`;
    })
    .join("");

  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;border-right:1px solid #f3f4f6;min-width:160px;">
      <div style="font-weight:600;color:#111827;">${esc(row.name)}</div>
      <div style="font-size:10px;color:#6b7280;">${esc(row.email)}</div>
    </td>
    ${dayCells}
    <td style="padding:8px 10px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600;vertical-align:top;">${esc(formatHours(row.totalHours))}</td>
    <td style="padding:8px 10px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600;vertical-align:top;">${esc(formatHours(row.avgHoursPerDay))}</td>
  </tr>`;
}

export function buildMeetingHoursEmailHtml(report: MeetingHoursReport): string {
  const rangeLabel = formatRangeLabel(report.range.start, report.range.end);
  const dayHeaders = report.days
    .map(
      (day) =>
        `<th style="padding:6px 4px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;min-width:48px;" title="${esc(day)}">${esc(formatDayHeader(day))}</th>`,
    )
    .join("");

  const rows = report.employees.map((row) => employeeRowHtml(row, report.days)).join("");

  const warnings =
    report.warnings.length > 0
      ? `<div style="margin:0 0 16px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;">
          ${report.warnings.map((w) => `<div>${esc(w)}</div>`).join("")}
        </div>`
      : "";

  const appUrl =
    process.env.MEETING_HOURS_REPORT_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://alyson-client.vercel.app";

  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f9fafb;padding:24px 12px;">
  <div style="max-width:960px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #f3f4f6;background:#fafafa;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:600;">Alyson Notetaker</div>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">Weekly meeting hours</h1>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">${esc(rangeLabel)} · ${esc(report.timeZone)} · join-URL meetings only</p>
    </div>
    <div style="padding:20px 24px 24px;">
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin:0 0 16px;">
        <div style="flex:1;min-width:140px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">Meetings</div>
          <div style="font-size:20px;font-weight:600;margin-top:4px;">${report.totals.meetings}</div>
        </div>
        <div style="flex:1;min-width:140px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">Total hours</div>
          <div style="font-size:20px;font-weight:600;margin-top:4px;">${esc(formatHours(report.totals.hours))}</div>
        </div>
        <div style="flex:1;min-width:140px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">Avg / employee</div>
          <div style="font-size:20px;font-weight:600;margin-top:4px;">${esc(formatHours(report.totals.avgHoursPerEmployee))}</div>
        </div>
      </div>
      ${warnings}
      <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;min-width:640px;">
          <thead>
            <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
              <th style="padding:8px 10px;text-align:left;font-weight:600;min-width:160px;">Employee</th>
              ${dayHeaders}
              <th style="padding:8px 10px;text-align:right;font-weight:600;min-width:64px;">Total</th>
              <th style="padding:8px 10px;text-align:right;font-weight:600;min-width:64px;">Avg/day</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${report.days.length + 3}" style="padding:16px;text-align:center;color:#6b7280;">No employees found for this range.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
        Cell = meeting hours that day. Generated ${esc(new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: report.timeZone }))}.
      </p>
      <p style="margin:12px 0 0;font-size:12px;">
        <a href="${esc(`${appUrl}/alyson-notetaker/meeting-hours`)}" style="color:#4f46e5;text-decoration:none;">Open Meeting Hours in Alyson</a>
      </p>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;">
      Sent via Amazon SES from ${esc(getSesFromAddress())}
    </div>
  </div>
</div>`;
}

export type MeetingHoursEmailRecipient = {
  name: string;
  email: string;
};

export type MeetingHoursEmailPreview = {
  configured: boolean;
  fromAddress: string;
  subject: string;
  range: { start: string; end: string };
  employeeCount: number | null;
  recipients: MeetingHoursEmailRecipient[];
  warnings: string[];
};

const RECIPIENT_DISPLAY_NAMES: Record<string, string> = {
  "thirumalai@cintara.ai": "Thirumalai",
  "mohita@cintara.ai": "Mohita",
  "arman@cintara.ai": "Arman",
  "alysonclient@cintara.ai": "Bill",
  "hamza@cintara.ai": "Hamza",
};

function defaultRecipientRows(): MeetingHoursEmailRecipient[] {
  return meetingHoursReportRecipients().map((email) => ({
    email,
    name: RECIPIENT_DISPLAY_NAMES[email.toLowerCase()] || email.split("@")[0] || email,
  }));
}

export async function previewMeetingHoursReportEmail(args?: {
  start?: string;
  end?: string;
  employeeCount?: number | null;
}): Promise<MeetingHoursEmailPreview> {
  const range =
    args?.start && args?.end ? { start: args.start, end: args.end } : meetingHoursReportRange();
  const warnings: string[] = [];
  if (!sesConfigured()) {
    warnings.push("Amazon SES is not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL.");
  }

  const employeeCount = args?.employeeCount ?? null;
  const subject =
    employeeCount != null
      ? `Meeting hours · ${formatRangeLabel(range.start, range.end)} · ${employeeCount} employees`
      : `Meeting hours · ${formatRangeLabel(range.start, range.end)}`;

  return {
    configured: sesConfigured(),
    fromAddress: getSesFromAddress(),
    subject,
    range,
    employeeCount,
    recipients: defaultRecipientRows(),
    warnings,
  };
}

export function buildMeetingHoursEmailSubject(report: MeetingHoursReport): string {
  const rangeLabel = formatRangeLabel(report.range.start, report.range.end);
  return `Meeting hours · ${rangeLabel} · ${report.employees.length} employees`;
}

export type MeetingHoursEmailSendResult = {
  sent: boolean;
  messageId?: string;
  recipients: string[];
  subject: string;
  range: { start: string; end: string };
  employeeCount: number;
  warnings: string[];
};

export async function buildAndSendMeetingHoursReportEmail(args?: {
  start?: string;
  end?: string;
  forceRefresh?: boolean;
  recipients?: string[];
  subject?: string;
}): Promise<MeetingHoursEmailSendResult> {
  if (!sesConfigured()) {
    throw new Error("Amazon SES is not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL.");
  }

  const to = args?.recipients?.length
    ? [...new Set(args.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))]
    : meetingHoursReportRecipients();
  if (!to.length) {
    throw new Error("No meeting hours report recipients configured");
  }

  const range = args?.start && args?.end ? { start: args.start, end: args.end } : meetingHoursReportRange();
  const report = await buildMeetingHoursReport({
    start: range.start,
    end: range.end,
    forceRefresh: args?.forceRefresh ?? true,
  });

  const subject = args?.subject?.trim() || buildMeetingHoursEmailSubject(report);
  const html = buildMeetingHoursEmailHtml(report);
  const sent = await sendSesEmail({ to, subject, html });

  return {
    sent: true,
    messageId: sent.messageId,
    recipients: sent.recipients,
    subject,
    range: report.range,
    employeeCount: report.employees.length,
    warnings: report.warnings,
  };
}
