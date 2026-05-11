import { supabase } from "@/integrations/supabase/client";
import type { Compensation, Department, Employee, MetricsRow } from "@/lib/queries";

export function demoOverviewParts() {
  const departments: Department[] = [
    { id: "dept_general", name: "General" },
    { id: "dept_engineering", name: "Engineering" },
    { id: "dept_hr", name: "HR" },
    { id: "dept_sales", name: "Sales" },
    { id: "dept_ops", name: "Ops" },
  ];

  const deptIds = departments.map((d) => d.id);
  const employees: Employee[] = new Array(25).fill(null).map((_, i) => {
    const n = i + 1;
    const dept = deptIds[i % deptIds.length]!;
    const role =
      i % 6 === 0
        ? "HR Specialist"
        : i % 6 === 1
          ? "Engineer"
          : i % 6 === 2
            ? "Designer"
            : i % 6 === 3
              ? "Recruiter"
              : i % 6 === 4
                ? "Sales Exec"
                : "Ops Associate";
    const level = String(1 + (i % 6));
    const hire = new Date(Date.UTC(2025, 0, 1));
    hire.setUTCDate(hire.getUTCDate() + i * 9);
    const hire_date = hire.toISOString().slice(0, 10);
    const performance_score = 2.8 + ((i * 13) % 22) / 10; // 2.8 - 5.0-ish
    const name = `Employee ${n}`;
    return {
      id: `demo_emp_${n.toString().padStart(3, "0")}`,
      full_name: name,
      email: `employee${n}@example.com`,
      role,
      level,
      department_id: dept,
      hire_date,
      performance_score: Math.min(5, Number(performance_score.toFixed(1))),
    };
  });

  const compensation: Compensation[] = employees.map((e, i) => {
    const base_salary = 45000 + (i % 10) * 3500;
    const bonus_pct = 8 + (i % 6) * 2;
    const equity_grant = i % 3 === 0 ? 5000 : 0;
    const benefits = 2500;
    return {
      id: `demo_comp_${e.id}`,
      employee_id: e.id,
      base_salary,
      bonus_pct,
      equity_grant,
      benefits,
      effective_date: "2026-01-01",
    };
  });

  const history: MetricsRow[] = ["2026-01", "2026-02", "2026-03", "2026-04"].map((period, i) => ({
    id: `demo_metrics_${period}`,
    period,
    total_compensation: 1200000 + i * 60000,
    total_bonus: 110000 + i * 5000,
    headcount: employees.length,
    avg_performance: 3.6 + i * 0.05,
  }));

  return { departments, employees, compensation, history };
}

export async function fetchOverviewPartsFromSupabase() {
  const [deps, emps, comps, metrics] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("employees").select("*"),
    supabase.from("compensation").select("*"),
    supabase.from("metrics_history").select("*").order("period"),
  ]);

  if (deps.error) throw deps.error;
  if (emps.error) throw emps.error;
  if (comps.error) throw comps.error;
  if (metrics.error) throw metrics.error;

  return {
    departments: (deps.data ?? []) as Department[],
    employees: (emps.data ?? []) as Employee[],
    compensation: (comps.data ?? []) as Compensation[],
    history: (metrics.data ?? []) as MetricsRow[],
  };
}

