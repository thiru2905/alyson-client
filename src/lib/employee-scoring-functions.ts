import { createServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { z } from "zod";
import type { EmployeeScoringResponse } from "@/lib/employee-scoring-types";

export type { EmployeeScoringResponse } from "@/lib/employee-scoring-types";

const Input = z
  .object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  })
  .optional();

const CACHE_TTL_MS = 90_000;
const scoringCache = new Map<string, { at: number; data: EmployeeScoringResponse }>();

function isoToDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid datetime in scoring window.");
  return format(d, "yyyy-MM-dd");
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export const getEmployeeScoring = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<EmployeeScoringResponse> => {
    const [
      { getWorkspaceActivity },
      { fetchTimeDoctorEmployeesTable },
      { computeEmployeeScores, SCORING_RULES_SUMMARY, SCORING_WEIGHTS },
      { getSpeakerIdentityIndex },
      { mergeEmployeeScoreInputsByIdentity },
      { clampRange, enumerateDays },
    ] = await Promise.all([
      import("@/lib/workspace-activity-functions"),
      import("@/lib/time-doctor-functions"),
      import("@/lib/employee-scoring-rules"),
      import("@/lib/speaker-identity.server"),
      import("@/lib/employee-scoring-merge.server"),
      import("@/lib/time-dashboard-range"),
    ]);

    const now = new Date();
    const fallbackStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fallbackEnd = now.toISOString();
    const startIso = data?.start ?? fallbackStart;
    const endIso = data?.end ?? fallbackEnd;

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      throw new Error("Start time must be earlier than end time.");
    }

    const cacheKey = `${startIso}|${endIso}`;
    const cached = scoringCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return {
        ...cached.data,
        warnings: [...cached.data.warnings, "served_from_cache"],
      };
    }

    const tdRaw = { start: isoToDate(startIso), end: isoToDate(endIso) };
    const tdRange = clampRange(tdRaw.start, tdRaw.end);
    const windowDays = enumerateDays(tdRange.start, tdRange.end).length;

    const warnings: string[] = [];
    if (tdRange.clipped) {
      warnings.push(`Time Doctor range capped to last 366 days (${tdRaw.start} → ${tdRaw.end}).`);
    }

    const [workspaceR, timeDoctorR] = await Promise.allSettled([
      getWorkspaceActivity({ data: { start: startIso, end: endIso, accurateMeetings: true } }),
      fetchTimeDoctorEmployeesTable({
        data: { start: tdRange.start, end: tdRange.end },
      }),
    ]);

    if (workspaceR.status === "rejected") {
      throw workspaceR.reason instanceof Error ? workspaceR.reason : new Error(String(workspaceR.reason));
    }

    const workspace = workspaceR.value;
    warnings.push(...(workspace.warnings ?? []).slice(0, 8));

    const tdByEmail = new Map<string, { email: string; name: string; workSeconds: number }>();
    if (timeDoctorR.status === "fulfilled") {
      warnings.push(...(timeDoctorR.value.warnings ?? []).slice(0, 6));
      for (const emp of timeDoctorR.value.employees ?? []) {
        const key = normalizeEmail(emp.email);
        if (!key) continue;
        tdByEmail.set(key, {
          email: emp.email.trim(),
          name: emp.name?.trim() || emp.email.trim(),
          workSeconds: emp.rangeSeconds ?? 0,
        });
      }
    } else {
      warnings.push(`time_doctor: ${String(timeDoctorR.reason)}`);
    }

    const wsByEmail = new Map(
      (workspace.rows ?? []).map((r) => [normalizeEmail(r.userEmail), r] as const),
    );

    const allEmails = new Set<string>([...wsByEmail.keys(), ...tdByEmail.keys()].filter(Boolean));

    const rawInputs = Array.from(allEmails).map((email) => {
      const ws = wsByEmail.get(email);
      const td = tdByEmail.get(email);
      return {
        userEmail: ws?.userEmail ?? td?.email ?? email,
        displayName: td?.name ?? ws?.userEmail?.split("@")[0] ?? email,
        emailsSent: ws?.emailsSent ?? 0,
        meetingsCreated: ws?.meetingsCreated ?? 0,
        docsCreated: ws?.docsCreated ?? 0,
        chatMessagesSent: ws?.chatMessagesSent ?? 0,
        workSeconds: td?.workSeconds ?? 0,
        windowDays,
      };
    });

    const { index: speakerIdentity, warnings: identityWarnings } = await getSpeakerIdentityIndex();
    warnings.push(...identityWarnings.slice(0, 2));

    const { inputs, mergedAccountCount } = mergeEmployeeScoreInputsByIdentity(rawInputs, speakerIdentity);
    if (mergedAccountCount > 0) {
      warnings.push(
        `Merged ${mergedAccountCount} duplicate account${mergedAccountCount === 1 ? "" : "s"} (same person, multiple emails) before ranking.`,
      );
    }

    const { loadLeaveContextForScoring, applyLeaveCreditToScoreInputs } = await import(
      "@/lib/employee-scoring-leave.server"
    );
    const leaveCtx = await loadLeaveContextForScoring(tdRange.start, tdRange.end);
    const creditedInputs = applyLeaveCreditToScoreInputs(inputs, leaveCtx);
    const leaveCreditedCount = creditedInputs.filter((r) => (r.leaveHoursCredit ?? 0) > 0).length;
    if (leaveCreditedCount > 0) {
      warnings.push(
        `Leave credit (+7h/workday) applied for ${leaveCreditedCount} employee${leaveCreditedCount === 1 ? "" : "s"} with approved leave in range.`,
      );
    }

    const rows = computeEmployeeScores(creditedInputs);

    const result: EmployeeScoringResponse = {
      range: workspace.range,
      timeDoctorRange: { start: tdRange.start, end: tdRange.end, clipped: tdRange.clipped },
      windowDays,
      generatedAt: new Date().toISOString(),
      weights: SCORING_WEIGHTS,
      rules: SCORING_RULES_SUMMARY,
      rows,
      mergedAccountCount,
      warnings,
    };
    scoringCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
  });
