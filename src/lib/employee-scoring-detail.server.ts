import { z } from "zod";
import {
  SCORING_RULES_SUMMARY,
  SCORING_WEIGHTS,
} from "@/lib/employee-scoring-rules";
import type { EmployeeScoringDetail } from "@/lib/employee-scoring-detail-types";
import { getEmployeeScoring } from "@/lib/employee-scoring-functions";
import { fetchTimeDoctorUserDetail, listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";
import { clampRange } from "@/lib/time-dashboard-range";
import { fetchWorkspaceUserActivityDetailImpl } from "@/lib/workspace-activity.server";

const Input = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function runEmployeeScoringDetail(
  data: z.infer<typeof Input>,
): Promise<EmployeeScoringDetail> {
    const email = normalizeEmail(data.userEmail);
    const warnings: string[] = [];

    const [scoringR, workspaceR, tdUsersR] = await Promise.allSettled([
      getEmployeeScoring({ data: { start: data.start, end: data.end } }),
      fetchWorkspaceUserActivityDetailImpl({
        userEmail: email,
        start: data.start,
        end: data.end,
      }),
      listTimeDoctorUsersLight(),
    ]);

    if (scoringR.status === "rejected") {
      throw scoringR.reason instanceof Error ? scoringR.reason : new Error(String(scoringR.reason));
    }
    const scoring = scoringR.value;
    warnings.push(...scoring.warnings.slice(0, 6));

    const workspace =
      workspaceR.status === "fulfilled"
        ? workspaceR.value
        : {
            userEmail: email,
            range: scoring.range,
            generatedAt: new Date().toISOString(),
            emails: [],
            chats: [],
            docs: [],
            meetings: [],
            focusHints: [],
            warnings: [`workspace detail: ${String(workspaceR.reason)}`],
            gmailEnriched: false,
            docsEnriched: false,
            chatEnriched: false,
            stats: {
              emails: { count: 0, totalBodyChars: 0, avgBodyChars: 0 },
              chats: { count: 0, totalBodyChars: 0, avgBodyChars: 0 },
              docs: { count: 0, totalBodyChars: 0, totalWords: 0, avgWords: 0 },
              meetings: { count: 0 },
            },
          };
    if (workspaceR.status === "rejected") {
      warnings.push(`workspace detail: ${String(workspaceR.reason)}`);
    } else {
      warnings.push(...workspace.warnings.slice(0, 4));
    }

    const matchedScore = scoring.rows.find((r) => normalizeEmail(r.userEmail) === email) ?? null;

    let tdUserId: string | null = null;
    if (tdUsersR.status === "fulfilled") {
      const u = tdUsersR.value.find((x) => normalizeEmail(x.email) === email);
      tdUserId = u?.id ?? null;
    } else {
      warnings.push(`time_doctor users: ${String(tdUsersR.reason)}`);
    }

    const tdRange = clampRange(scoring.timeDoctorRange.start, scoring.timeDoctorRange.end);
    let overview: EmployeeScoringDetail["timeDoctor"]["overview"];
    let topApps: EmployeeScoringDetail["timeDoctor"]["topApps"] = [];
    let topProjects: EmployeeScoringDetail["timeDoctor"]["topProjects"] = [];

    if (tdUserId) {
      const [appsR, workR] = await Promise.allSettled([
        fetchTimeDoctorUserDetail({
          data: { userId: tdUserId, start: tdRange.start, end: tdRange.end, tab: "apps" },
        }),
        fetchTimeDoctorUserDetail({
          data: { userId: tdUserId, start: tdRange.start, end: tdRange.end, tab: "work" },
        }),
      ]);

      if (appsR.status === "fulfilled" && appsR.value.apps) {
        topApps = appsR.value.apps.top
          .map((a) => ({
            name: a.name,
            category: a.category,
            hours: (a.seconds ?? 0) / 3600,
          }))
          .slice(0, 12);
        warnings.push(...(appsR.value.warnings ?? []).slice(0, 2));
        const prod = appsR.value.apps.distribution.find((d) => d.category === "productive")?.seconds ?? 0;
        const poor = appsR.value.apps.distribution.find((d) => d.category === "distracting")?.seconds ?? 0;
        const neutral = appsR.value.apps.distribution.find((d) => d.category === "neutral")?.seconds ?? 0;
        const total = prod + poor + neutral || 1;
        overview = {
          productiveHours: prod / 3600,
          poorHours: poor / 3600,
          productivityScore: prod / total,
        };
      } else if (appsR.status === "rejected") {
        warnings.push(`time_doctor apps: ${String(appsR.reason)}`);
      }

      if (workR.status === "fulfilled" && workR.value.work) {
        topProjects = workR.value.work.timeByProject
          .map((p) => ({ name: p.name, hours: (p.seconds ?? 0) / 3600 }))
          .slice(0, 10);
        warnings.push(...(workR.value.warnings ?? []).slice(0, 2));
      } else if (workR.status === "rejected") {
        warnings.push(`time_doctor work: ${String(workR.reason)}`);
      }
    }

    const focusHints = deriveFocusHintsMerged(workspace, topApps);

    return {
      range: scoring.range,
      timeDoctorRange: { start: tdRange.start, end: tdRange.end },
      generatedAt: new Date().toISOString(),
      weights: SCORING_WEIGHTS,
      rules: SCORING_RULES_SUMMARY,
      score: matchedScore,
      workspace: { ...workspace, focusHints },
      timeDoctor: { userId: tdUserId, overview, topApps, topProjects },
      warnings: warnings.slice(0, 10),
    };
}

function deriveFocusHintsMerged(
  workspace: EmployeeScoringDetail["workspace"],
  topApps: Array<{ name: string; category: string; hours: number }>,
): string[] {
  const base = workspace.focusHints;
  if (!topApps.length) return base;
  const hints = [...base];
  const productive = topApps.filter((a) => a.category === "productive").slice(0, 3);
  if (productive.length && !hints.some((h) => h.includes("productive tools"))) {
    hints.unshift(
      `Time Doctor — productive tools: ${productive.map((a) => `${a.name} (${a.hours.toFixed(1)}h)`).join(", ")}`,
    );
  }
  return hints.slice(0, 8);
}
