import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WorkspaceActivityResponse } from "@/lib/workspace-activity-types";
import type { WorkspaceUserActivityDetail } from "@/lib/workspace-activity-types";

export type {
  GmailSentSnippet,
  WorkspaceActivityItem,
  WorkspaceActivityResponse,
  WorkspaceActivityRow,
  WorkspaceUserActivityDetail,
} from "@/lib/workspace-activity-types";

const ListInput = z
  .object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
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
