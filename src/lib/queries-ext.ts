import { supabase } from "@/integrations/supabase/client";

export async function fetchPayrollRuns() {
  const { data, error } = await supabase.from("payroll_runs").select("*").order("period", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPayrollItems(runId: string) {
  const { data, error } = await supabase
    .from("payroll_items")
    .select("*, employees(full_name, email, department_id, role)")
    .eq("payroll_run_id", runId);
  if (error) throw error;
  return data ?? [];
}

export async function fetchBonusPlans() {
  const { data, error } = await supabase.from("bonus_plans").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBonusAwards() {
  const { data, error } = await supabase
    .from("bonus_awards")
    .select("*, employees(full_name, role, department_id), bonus_plans(name, bonus_type)")
    .order("predicted_amount", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEquityHolders() {
  const { data, error } = await supabase
    .from("equity_holders")
    .select("*, equity_grants(id, security_type, total_shares, strike_price, grant_date, vesting_years, cliff_months, board_approved)")
    .order("display_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchVestingEvents() {
  const { data, error } = await supabase.from("vesting_events").select("*").order("vest_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchLeaveTypes() {
  const { data, error } = await supabase.from("leave_types").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchLeaveBalances() {
  const { data, error } = await supabase
    .from("leave_balances")
    .select("*, employees(full_name, department_id), leave_types(name, code, color)");
  if (error) throw error;
  return data ?? [];
}

export async function fetchAttendance(days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*, employees(full_name, department_id)")
    .gte("work_date", since)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchWorkflows() {
  const { data, error } = await supabase
    .from("workflow_instances")
    .select("*, workflow_templates(name, steps)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDocuments() {
  const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchReviews() {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, employees!reviews_employee_id_fkey(full_name, role, performance_score), review_cycles(name, status)")
    .order("rating", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchKpiDefinitions() {
  const { data, error } = await supabase.from("kpi_definitions").select("*").order("category");
  if (error) throw error;
  return data ?? [];
}
