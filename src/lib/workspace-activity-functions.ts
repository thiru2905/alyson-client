import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";
import type {
  WorkspaceActivityEmailBodyResult,
  WorkspaceActivityResponse,
  WorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-types";

export type {
  GmailSentSnippet,
  WorkspaceActivityEmailBodyResult,
  WorkspaceActivityItem,
  WorkspaceActivityResponse,
  WorkspaceActivityRow,
  WorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-types";

const ListInput = superAccessInputSchema.extend({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  accurateMeetings: z.boolean().optional(),
});

const DetailInput = superAccessInputSchema.extend({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const getWorkspaceActivity = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityResponse> => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { runGetWorkspaceActivity } = await import("@/lib/workspace-activity.server");
    const { clerkToken: _t, emailHint: _e, ...range } = data;
    return runGetWorkspaceActivity(range);
  });

export const getWorkspaceUserActivityDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DetailInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceUserActivityDetail> => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { runGetWorkspaceUserActivityDetail } = await import("@/lib/workspace-activity.server");
    const { clerkToken: _t, emailHint: _e, ...detail } = data;
    return runGetWorkspaceUserActivityDetail(detail);
  });

const InsightInput = superAccessInputSchema.extend({
  kind: z.enum(["doc", "email", "chat"]),
  title: z.string().min(1).max(500),
  preview: z.string().max(8000),
  at: z.string().min(1),
  userEmail: z.string().email(),
  rangeLabel: z.string().max(200).optional(),
});

export type WorkspaceActivityInsightResult = {
  summary: string;
  model: string;
};

const EmailBodyInput = superAccessInputSchema.extend({
  userEmail: z.string().email(),
  messageId: z.string().max(200).optional(),
  title: z.string().min(1).max(500),
  preview: z.string().max(50_000).optional(),
  at: z.string().min(1),
});

export const getWorkspaceActivityEmailBody = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EmailBodyInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityEmailBodyResult> => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { fetchGmailMessageFullBody } = await import("@/lib/workspace-activity-content.server");
    const { clerkToken: _t, emailHint: _e, ...payload } = data;
    if (payload.messageId) {
      const fromGmail = await fetchGmailMessageFullBody(payload.userEmail, payload.messageId);
      if (fromGmail) return fromGmail;
    }
    const preview = String(payload.preview || "").trim();
    return {
      subject: payload.title,
      sentAt: payload.at,
      body: preview || "(No email body available — Workspace audit only.)",
      source: "preview",
    };
  });

export const getWorkspaceActivityItemInsight = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InsightInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityInsightResult> => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { summarizeWorkspaceActivityItem } = await import("@/lib/workspace-activity-insight.server");
    const { clerkToken: _t, emailHint: _e, ...payload } = data;
    return summarizeWorkspaceActivityItem(payload);
  });
