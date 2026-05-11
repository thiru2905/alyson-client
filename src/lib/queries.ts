import { supabase } from "@/integrations/supabase/client";
import { getHrOverviewFromS3 } from "@/lib/hr-s3-overview-functions";
import { demoOverviewParts, fetchOverviewPartsFromSupabase } from "@/lib/queries-hr-parts";

export type Department = { id: string; name: string };
export type Employee = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  level: string;
  department_id: string;
  hire_date: string;
  performance_score: number;
  /** Optional org hierarchy support (used by `OrgChart`) */
  manager_id?: string | null;
  /** Optional raw manager name (S3 demo datasets) */
  manager_name?: string | null;
};
export type Compensation = {
  id: string;
  employee_id: string;
  base_salary: number;
  bonus_pct: number;
  equity_grant: number;
  benefits: number;
  effective_date: string;
};
export type MetricsRow = {
  id: string;
  period: string;
  total_compensation: number;
  total_bonus: number;
  headcount: number;
  avg_performance: number;
};
export type FormulaInput = {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit: string;
};
export type Formula = {
  id: string;
  name: string;
  description: string;
  expression: string;
  inputs: FormulaInput[];
  category: string;
};

export type EmployeeFull = Employee & {
  department_name: string;
  comp: Compensation | null;
  total_comp: number;
  effective_bonus: number;
};

function normalizeName(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickManagerName(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Handle cases like "Bill & Omer/Kumail" → "Bill"
  const first = s.split("&")[0]!.split("/")[0]!.split(",")[0]!.trim();
  return first || null;
}

function withManagerIds(employees: Employee[]) {
  const byName = new Map<string, string>();
  for (const e of employees) {
    const n = normalizeName(e.full_name);
    if (n) byName.set(n, e.id);
  }

  return employees.map((e) => {
    const anyE = e as any;
    const managerNameRaw = anyE.manager_name ?? anyE.manager ?? anyE.Manager ?? anyE.reports_to ?? anyE.reportsTo;
    const managerName = pickManagerName(managerNameRaw);
    const self = normalizeName(e.full_name);
    const managerNorm = normalizeName(managerName);

    // self-managed or missing manager => root
    if (!managerName || (managerNorm && managerNorm === self)) {
      return { ...e, manager_id: anyE.manager_id ?? null, manager_name: managerName ?? null };
    }

    let managerId = byName.get(managerNorm) ?? null;
    // Fuzzy fallback: "Omer" should match "Muhammad Omer Affan", etc.
    if (!managerId && managerNorm) {
      const matches = employees
        .filter((x) => normalizeName(x.full_name).includes(managerNorm))
        .map((x) => x.id);
      if (matches.length === 1) managerId = matches[0] ?? null;
    }
    // If a manager name exists but we can't resolve it, keep as root (still renders)
    return { ...e, manager_id: anyE.manager_id ?? managerId, manager_name: managerName };
  });
}

function toOverviewFull(parts: {
  departments: Department[];
  employees: Employee[];
  compensation: Compensation[];
  history: MetricsRow[];
}) {
  const { departments, employees, compensation, history } = parts;
  const compByEmp = new Map(compensation.map((c) => [c.employee_id, c]));
  const deptById = new Map(departments.map((d) => [d.id, d.name]));

  const employeesFull: EmployeeFull[] = employees.map((e) => {
    const c = compByEmp.get(e.id) ?? null;
    const base = Number(c?.base_salary ?? 0);
    const bonus = Number(c?.bonus_pct ?? 0);
    const perf = Number(e.performance_score);
    const equity = Number(c?.equity_grant ?? 0);
    const benefits = Number(c?.benefits ?? 0);
    const effective_bonus = (base * bonus) / 100 * (perf / 3);
    const total_comp = base + effective_bonus + equity + benefits;
    return {
      ...e,
      department_name: deptById.get(e.department_id) ?? "—",
      comp: c,
      total_comp,
      effective_bonus,
    };
  });

  return { departments, employees: employeesFull, history };
}

export async function fetchOverview() {
  const overviewSource = String(import.meta.env.VITE_HR_OVERVIEW_SOURCE ?? "")
    .trim()
    .toLowerCase();

  const demoMode =
    String(import.meta.env.VITE_DEMO_MODE ?? "")
      .trim()
      .toLowerCase() === "true";

  // Auto-prefer S3 snapshot when available.
  //
  // Why: deployments often forget to set VITE_HR_OVERVIEW_SOURCE at build time, which causes
  // Team to silently fall back to Supabase/demo data. Since S3 snapshot reads are server-side,
  // we can probe S3 first and fall back if unavailable.
  if (!overviewSource) {
    try {
      const snap = await getHrOverviewFromS3();
      if ((snap.employees?.length ?? 0) > 0) {
        return toOverviewFull({
          departments: snap.departments,
          employees: withManagerIds(snap.employees as Employee[]),
          compensation: snap.compensation,
          history: snap.history,
        });
      }
    } catch {
      // ignore and continue to configured modes below
    }
  }

  // If explicitly configured, always use S3 snapshot (recommended for "dummy data" deployments).
  // This avoids any Supabase dependency for Team/Overview reads.
  if (overviewSource === "s3") {
    const snap = await getHrOverviewFromS3();
    return toOverviewFull({
      departments: snap.departments,
      employees: withManagerIds(snap.employees as Employee[]),
      compensation: snap.compensation,
      history: snap.history,
    });
  }

  // Demo mode = local dummy dataset (no Supabase calls).
  if (demoMode) return toOverviewFull(demoOverviewParts());

  const s3Fallback =
    String(import.meta.env.VITE_HR_S3_FALLBACK ?? "")
      .trim()
      .toLowerCase() === "true";

  try {
    // Primary source: Supabase (normal mode)
    const parts = await fetchOverviewPartsFromSupabase();
    // If Supabase returns "empty but not error", prefer S3 snapshot so Team doesn't look blank.
    // This is common in demo/staging deployments where Supabase tables exist but aren't seeded.
    if ((parts.employees?.length ?? 0) === 0) {
      try {
        const snap = await getHrOverviewFromS3();
        if ((snap.employees?.length ?? 0) > 0) {
          return toOverviewFull({
            departments: snap.departments,
            employees: withManagerIds(snap.employees as Employee[]),
            compensation: snap.compensation,
            history: snap.history,
          });
        }
      } catch {
        // Ignore S3 errors here and keep the Supabase result.
      }
    }

    return toOverviewFull(parts);
  } catch (err) {
    if (!s3Fallback) throw err;
    // Fallback: S3 snapshot (helps in deployments where Supabase is flaky/blocked)
    const snap = await getHrOverviewFromS3();
    return toOverviewFull({
      departments: snap.departments,
      employees: withManagerIds(snap.employees as Employee[]),
      compensation: snap.compensation,
      history: snap.history,
    });
  }
}

export async function fetchFormulas(): Promise<Formula[]> {
  const { data, error } = await supabase.from("formulas").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((f) => ({
    ...f,
    inputs: typeof f.inputs === "string" ? JSON.parse(f.inputs) : (f.inputs as FormulaInput[]),
  })) as Formula[];
}
