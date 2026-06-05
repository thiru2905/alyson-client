import type { EmployeeScoreRow, ScoringWeights } from "@/lib/employee-scoring-rules";

export type EmployeeScoringResponse = {
  range: { start: string; end: string };
  timeDoctorRange: { start: string; end: string; clipped: boolean };
  windowDays: number;
  generatedAt: string;
  weights: ScoringWeights;
  rules: readonly string[];
  rows: EmployeeScoreRow[];
  mergedAccountCount: number;
  warnings: string[];
};
