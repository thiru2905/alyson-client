import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EmployeeWorkspaceAiAnalysis } from "@/lib/employee-workspace-ai-analysis-types";

const Input = z.object({
  userEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  displayName: z.string().optional(),
});

export const analyzeEmployeeWorkspaceFocus = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<EmployeeWorkspaceAiAnalysis> => {
    const { runAnalyzeEmployeeWorkspaceFocus } = await import(
      "@/lib/employee-workspace-ai-analysis.server"
    );
    return runAnalyzeEmployeeWorkspaceFocus(data);
  });
