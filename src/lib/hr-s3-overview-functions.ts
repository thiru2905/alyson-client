import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getHrOverviewSnapshotFromS3, putHrOverviewSnapshotToS3, type HrOverviewSnapshot } from "@/lib/hr-s3-overview.server";
import { demoOverviewParts, fetchOverviewPartsFromSupabase } from "@/lib/queries-hr-parts";

export const getHrOverviewFromS3 = createServerFn({ method: "GET" }).handler(async () => {
  return await getHrOverviewSnapshotFromS3();
});

const SyncInput = z.object({
  source: z.enum(["supabase", "demo"]).default("demo"),
});

export const syncHrOverviewToS3 = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SyncInput.parse(data))
  .handler(async ({ data }) => {
    const generatedAt = new Date().toISOString();
    const parts =
      data.source === "supabase"
        ? await fetchOverviewPartsFromSupabase()
        : demoOverviewParts();

    const snapshot: HrOverviewSnapshot = {
      version: 1,
      generatedAt,
      source: data.source,
      departments: parts.departments,
      employees: parts.employees,
      compensation: parts.compensation,
      history: parts.history,
    };

    return await putHrOverviewSnapshotToS3(snapshot);
  });

