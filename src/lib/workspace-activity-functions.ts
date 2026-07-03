import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

const ListInput = z
  .object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    accurateMeetings: z.boolean().optional(),
  })
  .optional();

const DetailInput = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const getWorkspaceActivity = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityResponse> => {
    const { runGetWorkspaceActivity } = await import("@/lib/workspace-activity.server");
    return runGetWorkspaceActivity(data);
  });

export const getWorkspaceUserActivityDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => DetailInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceUserActivityDetail> => {
    const { runGetWorkspaceUserActivityDetail } = await import("@/lib/workspace-activity.server");
    return runGetWorkspaceUserActivityDetail(data);
  });

const InsightInput = z.object({
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

const EmailBodyInput = z.object({
  userEmail: z.string().email(),
  messageId: z.string().max(200).optional(),
  title: z.string().min(1).max(500),
  preview: z.string().max(50_000).optional(),
  at: z.string().min(1),
});

export const getWorkspaceActivityEmailBody = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EmailBodyInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityEmailBodyResult> => {
    const { fetchGmailMessageFullBody } = await import("@/lib/workspace-activity-content.server");
    if (data.messageId) {
      const fromGmail = await fetchGmailMessageFullBody(data.userEmail, data.messageId);
      if (fromGmail) return fromGmail;
    }
    const preview = String(data.preview || "").trim();
    return {
      subject: data.title,
      sentAt: data.at,
      body: preview || "(No email body available — Workspace audit only.)",
      source: "preview",
    };
  });

export const getWorkspaceActivityItemInsight = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InsightInput.parse(data))
  .handler(async ({ data }): Promise<WorkspaceActivityInsightResult> => {
    const { summarizeWorkspaceActivityItem } = await import("@/lib/workspace-activity-insight.server");
    return summarizeWorkspaceActivityItem(data);
  });
