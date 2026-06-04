import { format } from "date-fns";
import JSZip from "jszip";
import { getEmployeeScoring } from "@/lib/employee-scoring-functions";
import { getHourlyActivityReport } from "@/lib/hourly-activity-functions";
import { buildHourlyActivityPdfBuffer } from "@/lib/hourly-activity-pdf";
import { medalEmojiForRank } from "@/lib/rank-medals-core";
import {
  csvBuffer,
  emailToSlug,
  HOURLY_EXPORT_HEADERS,
  hourlyRowsToRecords,
  mapWithConcurrency,
  xlsxBuffer,
} from "@/lib/report-export-utils.server";
import { fetchTimeDoctorEmployeesTable, listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";
import type { WorkspaceActivityRow } from "@/lib/workspace-activity-types";

export type DailyReportWindow = {
  startIso: string;
  endIso: string;
  hoursBack: number;
  tdStart: string;
  tdEnd: string;
};

export type EmployeeForDailyReport = {
  email: string;
  name: string;
  timeDoctorUserId?: string;
};

export type DailyZipBuildResult = {
  zipBuffer: Buffer;
  zipFilename: string;
  employeeCount: number;
  filesAdded: number;
  hourlySuccess: number;
  hourlyFailed: string[];
  warnings: string[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isDailyHourlyIncluded() {
  return process.env.DAILY_REPORT_INCLUDE_HOURLY?.trim().toLowerCase() === "true";
}

export function isDailySectionIncluded(
  key: "scoring" | "workspace" | "time_doctor",
) {
  const envKey =
    key === "scoring"
      ? "DAILY_REPORT_INCLUDE_SCORING"
      : key === "workspace"
        ? "DAILY_REPORT_INCLUDE_WORKSPACE"
        : "DAILY_REPORT_INCLUDE_TIME_DOCTOR";
  const v = process.env[envKey]?.trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
}

export function mergeEmployeesFromCompanyData(args: {
  scoringRows?: Array<{ userEmail: string; displayName?: string }>;
  workspaceRows?: Array<{ userEmail: string }>;
  timeDoctorEmployees?: Array<{ id: string; email: string; name?: string }>;
  timeDoctorUsers?: Array<{ id: string; email: string; name: string }>;
}): EmployeeForDailyReport[] {
  const byEmail = new Map<string, EmployeeForDailyReport>();

  for (const r of args.scoringRows ?? []) {
    const email = normalizeEmail(r.userEmail);
    if (!email) continue;
    byEmail.set(email, {
      email,
      name: r.displayName?.trim() || email.split("@")[0] || email,
    });
  }

  for (const r of args.workspaceRows ?? []) {
    const email = normalizeEmail(r.userEmail);
    if (!email) continue;
    const cur = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: cur?.name || email.split("@")[0] || email,
      timeDoctorUserId: cur?.timeDoctorUserId,
    });
  }

  for (const e of args.timeDoctorEmployees ?? []) {
    const email = normalizeEmail(e.email);
    if (!email) continue;
    const cur = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: (e.name || cur?.name || email.split("@")[0] || email).trim(),
      timeDoctorUserId: e.id || cur?.timeDoctorUserId,
    });
  }

  for (const u of args.timeDoctorUsers ?? []) {
    const email = normalizeEmail(u.email);
    if (!email) continue;
    const cur = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: cur?.name || u.name || email.split("@")[0] || email,
      timeDoctorUserId: u.id || cur?.timeDoctorUserId,
    });
  }

  return Array.from(byEmail.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function buildDailyReportZip(args: {
  window: DailyReportWindow;
  employees: EmployeeForDailyReport[];
  scoringRows?: Awaited<ReturnType<typeof getEmployeeScoring>>["rows"];
  workspaceRows?: WorkspaceActivityRow[];
  timeDoctorEmployees?: Awaited<ReturnType<typeof fetchTimeDoctorEmployeesTable>>["employees"];
  initialWarnings?: string[];
}): Promise<DailyZipBuildResult> {
  const { window, employees } = args;
  const warnings = [...(args.initialWarnings ?? [])];
  const zip = new JSZip();
  let filesAdded = 0;

  const scoringMap = new Map(
    (args.scoringRows ?? []).map((r) => [normalizeEmail(r.userEmail), r] as const),
  );
  const wsMap = new Map(
    (args.workspaceRows ?? []).map((r) => [normalizeEmail(r.userEmail), r] as const),
  );
  const tdMap = new Map(
    (args.timeDoctorEmployees ?? []).map((e) => [normalizeEmail(e.email), e] as const),
  );

  const hourlyOn = isDailyHourlyIncluded();
  const readme = [
    "Alyson HR — Daily report bundle",
    `Window (UTC): ${window.startIso} → ${window.endIso}`,
    "",
    "company/ — all-employee CSV + Excel:",
    ...(isDailySectionIncluded("scoring") ? ["  - employee-scoring"] : []),
    ...(isDailySectionIncluded("workspace") ? ["  - workspace-activity"] : []),
    ...(isDailySectionIncluded("time_doctor") ? ["  - time-dashboard (Time Doctor)"] : []),
    ...(hourlyOn
      ? [`employees/{name}/ — hourly PDF, CSV, Excel (${employees.length} people)`]
      : ["(Hourly per-employee exports are disabled.)"]),
    "",
    "Generated automatically.",
  ].join("\n");
  zip.file("README.txt", readme);
  filesAdded += 1;

  if (isDailySectionIncluded("scoring") && args.scoringRows?.length) {
    const scoringRecords = args.scoringRows.map((r) => ({
      medal: medalEmojiForRank(r.rank) ?? "",
      rank: r.rank,
      employee: r.displayName || r.userEmail,
      email: r.userEmail,
      grade: r.grade,
      composite_score: r.compositeScore,
      work_hours: r.workHours,
      hours_per_day: r.hoursPerDay,
      emails_sent: r.emailsSent,
      meetings_created: r.meetingsCreated,
      chat_messages: r.chatMessagesSent,
      docs_created: r.docsCreated,
    }));
    zip.file("company/employee-scoring.csv", csvBuffer(scoringRecords));
    zip.file(
      "company/employee-scoring.xlsx",
      xlsxBuffer([{ name: "Scoring", rows: scoringRecords }]),
    );
    filesAdded += 2;
  }

  if (isDailySectionIncluded("workspace") && args.workspaceRows?.length) {
    const wsRecords = args.workspaceRows.map((r) => ({
      email: r.userEmail,
      emails_sent: r.emailsSent,
      meetings_created: r.meetingsCreated,
      docs_created: r.docsCreated,
      chat_messages: r.chatMessagesSent,
    }));
    zip.file("company/workspace-activity.csv", csvBuffer(wsRecords));
    zip.file(
      "company/workspace-activity.xlsx",
      xlsxBuffer([{ name: "Workspace", rows: wsRecords }]),
    );
    filesAdded += 2;
  }

  if (isDailySectionIncluded("time_doctor") && args.timeDoctorEmployees?.length) {
    const tdRecords = args.timeDoctorEmployees.map((e) => ({
      employee: e.name || e.email,
      email: e.email,
      period_hours: Number(((e.rangeSeconds ?? 0) / 3600).toFixed(2)),
      daily_hours: Number(((e.dailySeconds ?? 0) / 3600).toFixed(2)),
      weekly_hours: Number(((e.weeklySeconds ?? 0) / 3600).toFixed(2)),
      calendar_month_hours: Number(((e.monthlySeconds ?? 0) / 3600).toFixed(2)),
    }));
    zip.file("company/time-dashboard.csv", csvBuffer(tdRecords));
    zip.file(
      "company/time-dashboard.xlsx",
      xlsxBuffer([{ name: "TimeDoctor", rows: tdRecords }]),
    );
    filesAdded += 2;
  }

  const includeHourly = isDailyHourlyIncluded();
  const concurrency = Math.min(
    8,
    Math.max(1, Number(process.env.DAILY_REPORT_CONCURRENCY || "3") || 3),
  );

  const hourlyFailed: string[] = [];
  let hourlySuccess = 0;

  if (includeHourly && employees.length) {
    await mapWithConcurrency(employees, concurrency, async (emp) => {
      const slug = emailToSlug(emp.email);
      const folder = `employees/${slug}`;
      const scoring = scoringMap.get(emp.email);
      const ws = wsMap.get(emp.email);
      const td = tdMap.get(emp.email);

      const summaryRow = {
        employee: emp.name,
        email: emp.email,
        scoring_rank: scoring?.rank ?? "",
        grade: scoring?.grade ?? "",
        composite_score: scoring?.compositeScore ?? "",
        work_hours: scoring?.workHours ?? "",
        emails_sent: ws?.emailsSent ?? "",
        meetings: ws?.meetingsCreated ?? "",
        docs: ws?.docsCreated ?? "",
        chat: ws?.chatMessagesSent ?? "",
        period_hours: td ? Number(((td.rangeSeconds ?? 0) / 3600).toFixed(2)) : "",
        daily_hours: td ? Number(((td.dailySeconds ?? 0) / 3600).toFixed(2)) : "",
      };

      try {
        const hourly = await getHourlyActivityReport({
          data: {
            start: window.startIso,
            end: window.endIso,
            userEmail: emp.email,
            timeDoctorUserId: emp.timeDoctorUserId,
            displayName: emp.name,
          },
        });

        const records = hourlyRowsToRecords(hourly.rows);
        zip.file(`${folder}/hourly-activity.csv`, csvBuffer(records, [...HOURLY_EXPORT_HEADERS]));
        zip.file(
          `${folder}/hourly-activity.xlsx`,
          xlsxBuffer([
            { name: "Hourly", rows: records },
            { name: "Summary", rows: [summaryRow] },
          ]),
        );
        zip.file(
          `${folder}/hourly-activity.pdf`,
          buildHourlyActivityPdfBuffer({
            rows: hourly.rows,
            displayName: hourly.displayName,
            userEmail: hourly.userEmail,
            range: hourly.range,
            generatedAt: hourly.generatedAt,
          }),
        );
        filesAdded += 3;
        hourlySuccess += 1;
      } catch (e) {
        hourlyFailed.push(`${emp.email}: ${e instanceof Error ? e.message : String(e)}`);
        zip.file(
          `${folder}/summary-only.csv`,
          csvBuffer([{ ...summaryRow, hourly_error: String(e) }]),
        );
        filesAdded += 1;
      }
    });
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipFilename = `alyson-daily-reports-${format(new Date(window.endIso), "yyyy-MM-dd")}.zip`;

  return {
    zipBuffer,
    zipFilename,
    employeeCount: employees.length,
    filesAdded,
    hourlySuccess,
    hourlyFailed,
    warnings,
  };
}
