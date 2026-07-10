import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";

const ReportInput = superAccessInputSchema
  .extend({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    forceRefresh: z.boolean().optional(),
  })
  .refine((d) => d.start <= d.end, {
    message: "Start date must be on or before end date",
  });

export const getMeetingHoursReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ReportInput.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { buildMeetingHoursReport } = await import("@/lib/meeting-hours-report.server");
    const report = await buildMeetingHoursReport({
      start: data.start,
      end: data.end,
      forceRefresh: data.forceRefresh,
    });
    return { report };
  });
