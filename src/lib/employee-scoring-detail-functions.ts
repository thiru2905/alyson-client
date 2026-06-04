import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EmployeeScoringDetail } from "@/lib/employee-scoring-detail-types";

const Input = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const getEmployeeScoringDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<EmployeeScoringDetail> => {
    const { runEmployeeScoringDetail } = await import("@/lib/employee-scoring-detail.server");
    return runEmployeeScoringDetail(data);
  });
