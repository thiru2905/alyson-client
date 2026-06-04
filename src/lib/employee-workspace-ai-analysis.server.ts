import { format } from "date-fns";
import { z } from "zod";
import { groqChat, groqModel, extractJsonObject } from "@/lib/groq-chat.server";
import type {
  EmployeeWorkspaceAiAnalysis,
  FocusCluster,
} from "@/lib/employee-workspace-ai-analysis-types";
import {
  fetchWorkspaceUserActivityDetailImpl,
  listUserSentGmailSnippets,
} from "@/lib/workspace-activity.server";
import type { GmailSentSnippet, WorkspaceUserActivityDetail } from "@/lib/workspace-activity-types";
import { fetchTimeDoctorUserDetail, listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";
import { clampRange } from "@/lib/time-dashboard-range";

export type { EmployeeWorkspaceAiAnalysis, FocusCluster } from "@/lib/employee-workspace-ai-analysis-types";

const Input = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  displayName: z.string().optional(),
});

const ClusterSchema = z.object({
  label: z.string(),
  description: z.string(),
  count: z.number().optional(),
  sharePercent: z.number().optional(),
  examples: z.array(z.string()).optional(),
});

const AnalysisSchema = z.object({
  summary: z.string(),
  primaryFocus: z.string(),
  workThemes: z.array(z.string()).optional(),
  emailClusters: z.array(ClusterSchema).optional(),
  chatClusters: z.array(ClusterSchema).optional(),
  docClusters: z.array(ClusterSchema).optional(),
  meetingClusters: z.array(ClusterSchema).optional(),
  limitations: z.array(z.string()).optional(),
});

type CorpusLine = {
  kind: "email" | "gmail" | "chat" | "doc" | "meeting" | "app";
  at: string;
  text: string;
};

const ANALYSIS_CACHE_MS = 10 * 60_000;
const analysisCache = new Map<string, { at: number; data: EmployeeWorkspaceAiAnalysis }>();

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCluster(c: z.infer<typeof ClusterSchema>, fallbackCount: number): FocusCluster {
  return {
    label: c.label.trim() || "Other",
    description: c.description.trim(),
    count: c.count ?? fallbackCount,
    sharePercent: Math.min(100, Math.max(0, c.sharePercent ?? 0)),
    examples: (c.examples ?? []).map((e) => e.trim()).filter(Boolean).slice(0, 5),
  };
}

function buildCorpus(
  workspace: WorkspaceUserActivityDetail,
  gmail: GmailSentSnippet[],
  topApps: Array<{ name: string; category: string; hours: number }>,
): CorpusLine[] {
  const lines: CorpusLine[] = [];

  for (const e of workspace.emails) {
    lines.push({
      kind: "email",
      at: e.at,
      text: `EMAIL subject="${e.title}"${e.detail ? ` context="${e.detail}"` : ""}`,
    });
  }
  for (const g of gmail) {
    lines.push({
      kind: "gmail",
      at: g.at,
      text: `GMAIL_SENT subject="${g.subject}" snippet="${g.snippet}"${g.to ? ` to="${g.to}"` : ""}`,
    });
  }
  for (const c of workspace.chats) {
    lines.push({
      kind: "chat",
      at: c.at,
      text: `CHAT text="${c.title}"${c.detail ? ` ${c.detail}` : ""}`,
    });
  }
  for (const d of workspace.docs) {
    lines.push({
      kind: "doc",
      at: d.at,
      text: `DOC title="${d.title}"${d.detail ? ` type="${d.detail}"` : ""}`,
    });
  }
  for (const m of workspace.meetings) {
    lines.push({
      kind: "meeting",
      at: m.at,
      text: `MEETING title="${m.title}"${m.detail ? ` notes="${m.detail.slice(0, 120)}"` : ""}`,
    });
  }
  for (const a of topApps.slice(0, 8)) {
    lines.push({
      kind: "app",
      at: workspace.range.end,
      text: `TIME_DOCTOR_APP name="${a.name}" category="${a.category}" hours=${a.hours.toFixed(1)}`,
    });
  }

  return lines;
}

function compactCorpusForLlm(lines: CorpusLine[]): string {
  return lines
    .slice(0, 120)
    .map((l, i) => `${i + 1}. [${l.kind}] ${l.at.slice(0, 10)} ${l.text.slice(0, 280)}`)
    .join("\n");
}

async function loadTopApps(userEmail: string, startIso: string, endIso: string) {
  const tdStart = format(new Date(startIso), "yyyy-MM-dd");
  const tdEnd = format(new Date(endIso), "yyyy-MM-dd");
  const tdRange = clampRange(tdStart, tdEnd);
  const users = await listTimeDoctorUsersLight().catch(() => []);
  const u = users.find((x) => normalizeEmail(x.email) === normalizeEmail(userEmail));
  if (!u?.id) return [];
  const detail = await fetchTimeDoctorUserDetail({
    data: { userId: u.id, start: tdRange.start, end: tdRange.end, tab: "apps" },
  }).catch(() => null);
  return (detail?.apps?.top ?? []).map((a) => ({
    name: a.name,
    category: a.category,
    hours: (a.seconds ?? 0) / 3600,
  }));
}

async function runGroqClusterAnalysis(args: {
  userEmail: string;
  displayName: string;
  range: { start: string; end: string };
  corpus: CorpusLine[];
  stats: EmployeeWorkspaceAiAnalysis["corpusStats"];
  extraLimitations: string[];
}): Promise<EmployeeWorkspaceAiAnalysis> {
  const corpusText = compactCorpusForLlm(args.corpus);
  if (!corpusText.trim()) {
    throw new Error("No email, chat, doc, or meeting content to analyze for this window.");
  }

  const sys = [
    "You are an HR/workforce analyst for Alyson.",
    "Cluster the employee's workspace activity by THEME (client delivery, internal ops, hiring, support, engineering, sales, planning, etc.).",
    "Use ONLY the activity lines provided — do not invent emails or messages.",
    "Return ONLY valid JSON (no markdown) matching this schema:",
    JSON.stringify({
      summary: "2-4 sentences",
      primaryFocus: "short phrase",
      workThemes: ["theme1"],
      emailClusters: [{ label: "", description: "", count: 0, sharePercent: 0, examples: [] }],
      chatClusters: [{ label: "", description: "", count: 0, sharePercent: 0, examples: [] }],
      docClusters: [{ label: "", description: "", count: 0, sharePercent: 0, examples: [] }],
      meetingClusters: [{ label: "", description: "", count: 0, sharePercent: 0, examples: [] }],
      limitations: [],
    }),
    "examples must be short quotes from the corpus. sharePercent ~100 per channel.",
  ].join("\n");

  const user = [
    `Employee: ${args.displayName} <${args.userEmail}>`,
    `Window: ${args.range.start} → ${args.range.end}`,
    `Stats: ${JSON.stringify(args.stats)}`,
    "",
    "Activity corpus:",
    corpusText,
  ].join("\n");

  const raw = await groqChat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    0.15,
  );

  const parsed = AnalysisSchema.parse(extractJsonObject(raw));
  const emailN = args.stats.auditEmails + args.stats.gmailSnippets;

  const limitations = [
    ...args.extraLimitations,
    ...(parsed.limitations ?? []),
    "Clusters are inferred from subjects/snippets/metadata — not guaranteed full message bodies.",
  ].slice(0, 6);

  return {
    generatedAt: new Date().toISOString(),
    model: groqModel(),
    userEmail: args.userEmail,
    displayName: args.displayName,
    summary: parsed.summary.trim(),
    primaryFocus: parsed.primaryFocus.trim(),
    workThemes: (parsed.workThemes ?? []).slice(0, 8),
    emailClusters: (parsed.emailClusters ?? []).map((c) => normalizeCluster(c, emailN)).slice(0, 8),
    chatClusters: (parsed.chatClusters ?? []).map((c) => normalizeCluster(c, args.stats.chats)).slice(0, 8),
    docClusters: (parsed.docClusters ?? []).map((c) => normalizeCluster(c, args.stats.docs)).slice(0, 6),
    meetingClusters: (parsed.meetingClusters ?? []).map((c) => normalizeCluster(c, args.stats.meetings)).slice(0, 6),
    limitations,
    corpusStats: args.stats,
  };
}

/** Groq clustering of emails, chat, docs, meetings (+ Gmail snippets when delegated). */
export async function runAnalyzeEmployeeWorkspaceFocus(
  data: z.infer<typeof Input>,
): Promise<EmployeeWorkspaceAiAnalysis> {
    const cacheKey = `${data.userEmail}|${data.start}|${data.end}`;
    const hit = analysisCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ANALYSIS_CACHE_MS) return hit.data;

    const email = normalizeEmail(data.userEmail);
    const displayName = data.displayName?.trim() || email.split("@")[0] || email;

    const [workspace, gmailR, topApps] = await Promise.all([
      fetchWorkspaceUserActivityDetailImpl({
        userEmail: email,
        start: data.start,
        end: data.end,
      }),
      listUserSentGmailSnippets(email, data.start, data.end),
      loadTopApps(email, data.start, data.end),
    ]);

    const limitations: string[] = [...workspace.warnings.slice(0, 3)];
    if (gmailR.warning) limitations.push(gmailR.warning);

    const corpus = buildCorpus(workspace, gmailR.items, topApps);
    const stats = {
      auditEmails: workspace.emails.length,
      gmailSnippets: gmailR.items.length,
      chats: workspace.chats.length,
      docs: workspace.docs.length,
      meetings: workspace.meetings.length,
      timeDoctorApps: topApps.length,
    };

    const result = await runGroqClusterAnalysis({
      userEmail: email,
      displayName,
      range: workspace.range,
      corpus,
      stats,
      extraLimitations: limitations,
    });

    analysisCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
}
