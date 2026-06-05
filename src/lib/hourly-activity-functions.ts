import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { HourlyActivityResponse } from "@/lib/hourly-activity-types";

export type { HourlyActivityRow, HourlyActivityResponse } from "@/lib/hourly-activity-types";

const Input = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  userEmail: z.string().email(),
  timeDoctorUserId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
});

export const getHourlyActivityReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<HourlyActivityResponse> => {
    const { runHourlyActivityReport } = await import("@/lib/hourly-activity-report.server");
    return runHourlyActivityReport(data);
  });
