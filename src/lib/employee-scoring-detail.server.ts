import { z } from "zod";
import {
  SCORING_RULES_SUMMARY,
  SCORING_WEIGHTS,
} from "@/lib/employee-scoring-rules";
import type { EmployeeScoringDetail } from "@/lib/employee-scoring-detail-types";
import { getEmployeeScoring } from "@/lib/employee-scoring-functions";
import { resolveCanonicalEmail } from "@/lib/speaker-identity";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";
import { fetchTimeDoctorUserDetail, listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";
import { clampRange } from "@/lib/time-dashboard-range";
import { fetchWorkspaceUserActivityDetailImpl } from "@/lib/workspace-activity.server";
import type { WorkspaceUserActivityDetail } from "@/lib/workspace-activity-types";

const Input = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function scoreRowMatchesEmail(
  row: { userEmail: string; linkedEmails?: string[] },
  email: string,
  canonicalEmail: string,
) {
  const key = normalizeEmail(email);
  if (normalizeEmail(row.userEmail) === key || normalizeEmail(row.userEmail) === canonicalEmail) return true;
  return (row.linkedEmails ?? []).some((linked) => normalizeEmail(linked) === key);
}

function mergeWorkspaceDetails(
  parts: WorkspaceUserActivityDetail[],
  primaryEmail: string,
): WorkspaceUserActivityDetail {
  if (!parts.length) {
    throw new Error("mergeWorkspaceDetails requires at least one workspace payload.");
  }
  if (parts.length === 1) return { ...parts[0]!, userEmail: primaryEmail };

  const base = { ...parts[0]! };
  base.userEmail = primaryEmail;
  base.emails = [];
  base.chats = [];
  base.docs = [];
  base.meetings = [];
  base.focusHints = [];
  base.warnings = [];
  base.stats = {
    emails: { count: 0, totalBodyChars: 0, avgBodyChars: 0 },
    chats: { count: 0, totalBodyChars: 0, avgBodyChars: 0 },
    docs: { count: 0, totalBodyChars: 0, totalWords: 0, avgWords: 0 },
    meetings: { count: 0 },
  };

  for (const part of parts) {
    base.emails.push(...part.emails);
    base.chats.push(...part.chats);
    base.docs.push(...part.docs);
    base.meetings.push(...part.meetings);
    base.focusHints.push(...part.focusHints);
    base.warnings.push(...part.warnings);
    base.gmailEnriched = base.gmailEnriched || part.gmailEnriched;
    base.docsEnriched = base.docsEnriched || part.docsEnriched;
    base.chatEnriched = base.chatEnriched || part.chatEnriched;
    base.stats.emails.count += part.stats.emails.count;
    base.stats.emails.totalBodyChars += part.stats.emails.totalBodyChars;
    base.stats.chats.count += part.stats.chats.count;
    base.stats.chats.totalBodyChars += part.stats.chats.totalBodyChars;
    base.stats.docs.count += part.stats.docs.count;
    base.stats.docs.totalBodyChars += part.stats.docs.totalBodyChars;
    base.stats.docs.totalWords += part.stats.docs.totalWords;
    base.stats.meetings.count += part.stats.meetings.count;
  }

  if (base.stats.emails.count > 0) {
    base.stats.emails.avgBodyChars = Math.round(base.stats.emails.totalBodyChars / base.stats.emails.count);
  }
  if (base.stats.chats.count > 0) {
    base.stats.chats.avgBodyChars = Math.round(base.stats.chats.totalBodyChars / base.stats.chats.count);
  }
  if (base.stats.docs.count > 0) {
    base.stats.docs.avgWords = Math.round(base.stats.docs.totalWords / base.stats.docs.count);
  }

  base.focusHints = [...new Set(base.focusHints)].slice(0, 8);
  base.warnings = [...new Set(base.warnings)].slice(0, 6);
  return base;
}

export async function runEmployeeScoringDetail(
  data: z.infer<typeof Input>,
): Promise<EmployeeScoringDetail> {
    const email = normalizeEmail(data.userEmail);
    const warnings: string[] = [];

    const { index: speakerIdentity } = await getSpeakerIdentityIndex();
    const canonicalEmail = resolveCanonicalEmail(email, speakerIdentity) || email;

    const [scoringR, tdUsersR] = await Promise.allSettled([
      getEmployeeScoring({ data: { start: data.start, end: data.end } }),
      listTimeDoctorUsersLight(),
    ]);

    if (scoringR.status === "rejected") {
      throw scoringR.reason instanceof Error ? scoringR.reason : new Error(String(scoringR.reason));
    }
    const scoring = scoringR.value;
    warnings.push(...scoring.warnings.slice(0, 6));

    const matchedScore =
      scoring.rows.find((r) => scoreRowMatchesEmail(r, email, canonicalEmail)) ?? null;
    const linkedEmails = matchedScore?.linkedEmails?.length
      ? matchedScore.linkedEmails
      : [canonicalEmail];

    const workspaceResults = await Promise.allSettled(
      linkedEmails.map((mailbox) =>
        fetchWorkspaceUserActivityDetailImpl({
          userEmail: mailbox,
          start: data.start,
          end: data.end,
        }),
      ),
    );

    const workspaceParts = workspaceResults
      .filter((r): r is PromiseFulfilledResult<WorkspaceUserActivityDetail> => r.status === "fulfilled")
      .map((r) => r.value);

    for (const r of workspaceResults) {
      if (r.status === "rejected") warnings.push(`workspace detail: ${String(r.reason)}`);
    }

    const workspace =
      workspaceParts.length > 0
        ? mergeWorkspaceDetails(workspaceParts, canonicalEmail)
        : {
            userEmail: canonicalEmail,
            range: scoring.range,
            generatedAt: new Date().toISOString(),
            emails: [],
            chats: [],
            docs: [],
            meetings: [],
            focusHints: [],
            warnings: workspaceResults.every((r) => r.status === "rejected")
              ? workspaceResults.map((r) => `workspace detail: ${String((r as PromiseRejectedResult).reason)}`)
              : [],
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
    warnings.push(...workspace.warnings.slice(0, 4));

    let tdUserId: string | null = null;
    if (tdUsersR.status === "fulfilled") {
      for (const mailbox of linkedEmails) {
        const u = tdUsersR.value.find((x) => normalizeEmail(x.email) === normalizeEmail(mailbox));
        if (u) {
          tdUserId = u.id;
          break;
        }
      }
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
