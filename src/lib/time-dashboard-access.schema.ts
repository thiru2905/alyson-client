import { z } from "zod";
import { superAccessInputSchema } from "@/lib/super-access-input";

export const timeDashboardAccessCheckSchema = superAccessInputSchema;

export type TimeDashboardAccessLevel = "full" | "team" | "none";

export type TimeDashboardAccessResult = {
  level: TimeDashboardAccessLevel;
  email: string;
  managerName?: string;
  /** Lowercase official emails for team-scoped viewers. */
  allowedEmployeeEmails?: string[];
  directReportCount?: number;
};

export const timeDashboardScopedAuthSchema = superAccessInputSchema;

export type TimeDashboardScopedAuth = z.infer<typeof timeDashboardScopedAuthSchema>;
