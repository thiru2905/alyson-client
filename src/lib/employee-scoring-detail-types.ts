import type { SCORING_WEIGHTS } from "@/lib/employee-scoring-rules";
import type { EmployeeScoreRow } from "@/lib/employee-scoring-rules";
import type { WorkspaceUserActivityDetail } from "@/lib/workspace-activity-types";

/** Client-safe employee scoring detail payload. */
export type EmployeeScoringDetail = {
  range: { start: string; end: string };
  timeDoctorRange: { start: string; end: string };
  generatedAt: string;
  weights: typeof SCORING_WEIGHTS;
  rules: readonly string[];
  score: EmployeeScoreRow | null;
  workspace: WorkspaceUserActivityDetail;
  timeDoctor: {
    userId: string | null;
    overview?: {
      productiveHours: number;
      poorHours: number;
      productivityScore: number;
    };
    topApps: Array<{ name: string; category: string; hours: number }>;
    topProjects: Array<{ name: string; hours: number }>;
  };
  warnings: string[];
};
