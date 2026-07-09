import { createServerFn } from "@tanstack/react-start";
import { timeDashboardAccessCheckSchema } from "@/lib/time-dashboard-access.schema";
import type { TimeDashboardAccessResult } from "@/lib/time-dashboard-access.schema";

export type { TimeDashboardAccessResult } from "@/lib/time-dashboard-access.schema";

export const checkTimeDashboardAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => timeDashboardAccessCheckSchema.parse(data))
  .handler(async ({ data }): Promise<TimeDashboardAccessResult> => {
    const { checkTimeDashboardAccessForToken } = await import("@/lib/time-dashboard-access.server");
    return checkTimeDashboardAccessForToken(data.clerkToken, data.emailHint);
  });
