import { deepseekApiKey, deepseekChat, resolveDeepseekModel } from "@/lib/groq-chat.server";
import type { AlysonBrainDashboardPayload, AlysonBrainInsights } from "@/lib/alyson-brain/alyson-brain-types";
import { buildAlysonBrainContextJson } from "@/lib/alyson-brain/alyson-brain-context.server";

const INSIGHTS_PROMPT = `You are Alyson Brain. Write a short executive narrative (3–5 paragraphs max) based ONLY on the JSON dashboard data.
Highlight strengths, risks, and 2–3 actionable recommendations. No markdown headers — plain prose paragraphs only.
If data is missing, mention what is unavailable. Do not invent numbers.`;

export async function generateAlysonBrainInsights(
  question: string,
  dashboard: AlysonBrainDashboardPayload,
): Promise<AlysonBrainInsights> {
  if (!deepseekApiKey()) {
    return {
      narrative: "AI insights unavailable — set DEEPSEEK_API_KEY to enable narrative analysis.",
      provider: "none",
      model: "none",
      generatedAt: new Date().toISOString(),
    };
  }

  const contextJson = JSON.stringify(dashboard, null, 2).slice(0, 40_000);
  const model = await resolveDeepseekModel();
  const narrative = await deepseekChat(
    [
      { role: "system", content: INSIGHTS_PROMPT },
      {
        role: "user",
        content: `Question: ${question}\n\nDashboard JSON:\n${contextJson}`,
      },
    ],
    0.3,
    { model },
  );

  return {
    narrative: narrative.trim() || "No insights generated.",
    provider: "deepseek",
    model,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateAlysonBrainReportNarrative(question: string): Promise<AlysonBrainInsights> {
  const { buildAlysonBrainFastDashboard } = await import("@/lib/alyson-brain/alyson-brain-context.server");
  const fast = await buildAlysonBrainFastDashboard(question);
  return generateAlysonBrainInsights(question, fast);
}

/** @deprecated use phased dashboard APIs */
export async function buildAlysonBrainContext(question: string) {
  const json = await buildAlysonBrainContextJson(question);
  return JSON.parse(json);
}
