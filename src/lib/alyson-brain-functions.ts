import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AlysonBrainDashboardPayload, AlysonBrainInsights } from "@/lib/alyson-brain/alyson-brain-types";

const QuestionInput = z.object({
  question: z.string().min(3).max(2000),
});

const SlowInput = z.object({
  question: z.string().min(3).max(2000),
  email: z.string().email(),
});

export type {
  AlysonBrainDashboardPayload,
  AlysonBrainEmployeeDashboard,
  AlysonBrainInsights,
} from "@/lib/alyson-brain/alyson-brain-types";

/** Fast dashboard — scoring, hours, pacing, leave, bonus, workspace */
export const fetchAlysonBrainDashboard = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => QuestionInput.parse(data))
  .handler(async ({ data }): Promise<AlysonBrainDashboardPayload> => {
    const { buildAlysonBrainFastDashboard } = await import("@/lib/alyson-brain/alyson-brain-context.server");
    return buildAlysonBrainFastDashboard(data.question.trim());
  });

/** Slow slice — meetings + tasks (loads after dashboard) */
export const fetchAlysonBrainSlowData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SlowInput.parse(data))
  .handler(async ({ data }) => {
    const { buildAlysonBrainSlowSlice } = await import("@/lib/alyson-brain/alyson-brain-context.server");
    return buildAlysonBrainSlowSlice({ question: data.question.trim(), email: data.email });
  });

/** AI narrative insights */
export const fetchAlysonBrainInsights = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => QuestionInput.parse(data))
  .handler(async ({ data }): Promise<AlysonBrainInsights> => {
    const { buildAlysonBrainFastDashboard } = await import("@/lib/alyson-brain/alyson-brain-context.server");
    const { generateAlysonBrainInsights } = await import("@/lib/alyson-brain/alyson-brain.server");
    const dashboard = await buildAlysonBrainFastDashboard(data.question.trim());
    return generateAlysonBrainInsights(data.question.trim(), dashboard);
  });
