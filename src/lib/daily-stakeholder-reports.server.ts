import { format } from "date-fns";
import {
  buildDailyReportZip,
  isDailyHourlyIncluded,
  mergeEmployeesFromCompanyData,
  type DailyReportWindow,
} from "@/lib/daily-employee-report-bundle.server";
import { getEmployeeScoring } from "@/lib/employee-scoring-functions";
import { parseEmailList, sendResendEmail } from "@/lib/resend-mail.server";
import { fetchTimeDoctorEmployeesTable, listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";
import { runGetWorkspaceActivity } from "@/lib/workspace-activity.server";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtIst(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function isoToDate(iso: string) {
  const d = new Date(iso);
  return format(d, "yyyy-MM-dd");
}

export type DailyReportSendResult = {
  sent: boolean;
  messageId?: string;
  recipients: string[];
  window: { start: string; end: string };
  employeeCount: number;
  filesInZip: number;
  hourlyReportsOk: number;
  hourlyReportsFailed: number;
  zipFilename: string;
  zipSizeMb: number;
  warnings: string[];
};

export async function buildAndSendDailyStakeholderReports(): Promise<DailyReportSendResult> {
  const enabled = process.env.DAILY_REPORT_ENABLED?.trim().toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "off") {
    throw new Error("Daily stakeholder reports are disabled (DAILY_REPORT_ENABLED=false)");
  }

  const recipients = parseEmailList(process.env.DAILY_REPORT_RECIPIENTS);
  if (!recipients.length) {
    throw new Error("Set DAILY_REPORT_RECIPIENTS to a comma-separated list of stakeholder emails");
  }

  const hoursBack = Math.min(168, Math.max(1, Number(process.env.DAILY_REPORT_HOURS_BACK || "24") || 24));
  const maxEmployees = Math.min(
    200,
    Math.max(1, Number(process.env.DAILY_REPORT_MAX_EMPLOYEES || "120") || 120),
  );

  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000);
  const window: DailyReportWindow = {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    hoursBack,
    tdStart: isoToDate(start.toISOString()),
    tdEnd: isoToDate(end.toISOString()),
  };

  const warnings: string[] = [];

  const includeHourly = isDailyHourlyIncluded();

  const [scoringR, wsR, tdR, tdUsersR] = await Promise.allSettled([
    getEmployeeScoring({ data: { start: window.startIso, end: window.endIso } }),
    runGetWorkspaceActivity({ start: window.startIso, end: window.endIso }),
    fetchTimeDoctorEmployeesTable({
      data: { start: window.tdStart, end: window.tdEnd, day: window.tdEnd },
    }),
    includeHourly ? listTimeDoctorUsersLight() : Promise.resolve([]),
  ]);

  const scoringRows = scoringR.status === "fulfilled" ? scoringR.value.rows : [];
  const workspaceRows = wsR.status === "fulfilled" ? wsR.value.rows : [];
  const timeDoctorEmployees = tdR.status === "fulfilled" ? tdR.value.employees : [];
  const timeDoctorUsers = tdUsersR.status === "fulfilled" ? tdUsersR.value : [];

  if (scoringR.status === "fulfilled") warnings.push(...(scoringR.value.warnings ?? []).slice(0, 3));
  else warnings.push(`employee_scoring: ${String(scoringR.reason)}`);
  if (wsR.status === "fulfilled") warnings.push(...(wsR.value.warnings ?? []).slice(0, 3));
  else warnings.push(`workspace_activity: ${String(wsR.reason)}`);
  if (tdR.status === "fulfilled") warnings.push(...(tdR.value.warnings ?? []).slice(0, 3));
  else warnings.push(`time_doctor: ${String(tdR.reason)}`);

  const allEmployees = includeHourly
    ? mergeEmployeesFromCompanyData({
        scoringRows,
        workspaceRows,
        timeDoctorEmployees,
        timeDoctorUsers,
      })
    : [];
  const employees = includeHourly ? allEmployees.slice(0, maxEmployees) : [];
  if (includeHourly && allEmployees.length > maxEmployees) {
    warnings.push(
      `Capped at ${maxEmployees} employees (${allEmployees.length} total). Raise DAILY_REPORT_MAX_EMPLOYEES if needed.`,
    );
  }

  const zipResult = await buildDailyReportZip({
    window,
    employees,
    scoringRows,
    workspaceRows,
    timeDoctorEmployees,
    initialWarnings: warnings,
  });

  warnings.push(...zipResult.warnings, ...zipResult.hourlyFailed.slice(0, 8));

  const zipSizeMb = zipResult.zipBuffer.length / (1024 * 1024);
  const maxZipMb = Number(process.env.DAILY_REPORT_MAX_ZIP_MB || "35") || 35;
  if (zipSizeMb > maxZipMb) {
    throw new Error(
      `ZIP is ${zipSizeMb.toFixed(1)} MB (limit ${maxZipMb} MB). Reduce DAILY_REPORT_MAX_EMPLOYEES or DAILY_REPORT_HOURS_BACK.`,
    );
  }

  const subject =
    process.env.DAILY_REPORT_EMAIL_SUBJECT?.trim() ||
    `Alyson HR daily — Time Dashboard, Scoring & Workspace — ${format(end, "dd MMM yyyy")}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#111;max-width:640px;">
      <h1 style="font-size:18px;margin:0 0 8px;">Alyson HR — Daily report bundle</h1>
      <p style="font-size:13px;color:#444;">
        Window (IST): ${esc(fmtIst(window.startIso))} → ${esc(fmtIst(window.endIso))}
      </p>
      <ul style="font-size:13px;line-height:1.6;padding-left:18px;">
        <li>Reports: <strong>Time Dashboard</strong>, <strong>Employee Scoring</strong>, <strong>Workspace Activity</strong> (CSV + Excel each)</li>
        <li><strong>${zipResult.filesAdded}</strong> files in ZIP</li>
        ${
          includeHourly
            ? `<li>Hourly per-employee: <strong>${zipResult.hourlySuccess}</strong> ok${
                zipResult.hourlyFailed.length ? `, ${zipResult.hourlyFailed.length} failed` : ""
              }</li>`
            : `<li>Hourly per-employee exports: <strong>off</strong> (company summaries only)</li>`
        }
        <li>Attachment: <strong>${esc(zipResult.zipFilename)}</strong> (${zipSizeMb.toFixed(1)} MB)</li>
      </ul>
      <p style="font-size:12px;color:#666;">
        Unzip <code>company/</code> for all-employee spreadsheets.
      </p>
    </div>`;

  const sent = await sendResendEmail({
    to: recipients,
    subject,
    html,
    text: `Alyson daily ZIP: Time Dashboard + Scoring + Workspace. ${zipResult.filesAdded} files, ${zipSizeMb.toFixed(1)} MB.`,
    attachments: [
      {
        filename: zipResult.zipFilename,
        content: zipResult.zipBuffer,
      },
    ],
  });

  return {
    sent: true,
    messageId: sent?.id,
    recipients,
    window: { start: window.startIso, end: window.endIso },
    employeeCount: zipResult.employeeCount,
    filesInZip: zipResult.filesAdded,
    hourlyReportsOk: zipResult.hourlySuccess,
    hourlyReportsFailed: zipResult.hourlyFailed.length,
    zipFilename: zipResult.zipFilename,
    zipSizeMb: Number(zipSizeMb.toFixed(2)),
    warnings: warnings.slice(0, 30),
  };
}
