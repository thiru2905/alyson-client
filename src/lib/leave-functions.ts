import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ANNUAL_DAYS_DEFAULT = 10;

function supabaseCaller(accessToken: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Response("Missing server Supabase env vars", { status: 500 });
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function callerUserId(accessToken: string) {
  const caller = supabaseCaller(accessToken);
  const { data: claims, error: claimsErr } = await caller.auth.getClaims(accessToken);
  if (claimsErr || !claims?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  return claims.claims.sub as string;
}

async function assertDbSuperAdmin(accessToken: string, userId: string) {
  const caller = supabaseCaller(accessToken);
  const { data: roles, error: rolesErr } = await caller
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
  if (!roles?.length) throw new Response("Forbidden", { status: 403 });
}

async function resolveApproverEmployeeId(userId: string): Promise<string | null> {
  const { data: prof } = await supabaseAdmin.from("profiles").select("employee_id").eq("id", userId).maybeSingle();
  return prof?.employee_id ?? null;
}

async function pickDefaultLeaveTypeId(): Promise<string | null> {
  const { data: byCode } = await supabaseAdmin
    .from("leave_types")
    .select("id, code")
    .in("code", ["annual", "pto", "vacation", "AL"])
    .limit(1)
    .maybeSingle();
  if (byCode?.id) return byCode.id;
  const { data: anyType } = await supabaseAdmin.from("leave_types").select("id").order("name").limit(1).maybeSingle();
  return anyType?.id ?? null;
}

function yearFromIsoDate(iso: string): number {
  return Number(iso.slice(0, 4));
}

async function sumApprovedDays(employeeId: string, leaveTypeId: string, year: number): Promise<number> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const { data: rows, error } = await supabaseAdmin
    .from("leave_requests")
    .select("days")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("status", "approved")
    .gte("start_date", start)
    .lte("start_date", end);
  if (error) throw new Response(error.message, { status: 500 });
  return (rows ?? []).reduce((s, r) => s + Number(r.days ?? 0), 0);
}

async function upsertBalanceFromApproved(employeeId: string, leaveTypeId: string, year: number) {
  const taken = await sumApprovedDays(employeeId, leaveTypeId, year);
  const entitled = ANNUAL_DAYS_DEFAULT;
  const remaining = Math.max(0, entitled - taken);

  const { data: existing } = await supabaseAdmin
    .from("leave_balances")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("year", year)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("leave_balances")
      .update({ entitled, taken, remaining })
      .eq("id", existing.id);
    if (error) throw new Response(error.message, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from("leave_balances").insert({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      entitled,
      taken,
      remaining,
    });
    if (error) throw new Response(error.message, { status: 500 });
  }
}

const DecideInput = z.object({
  accessToken: z.string().min(1),
  requestId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

/** Super admins only: approve/reject and sync `leave_balances` when approved. */
export const decideLeaveRequestAsSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DecideInput.parse(data))
  .handler(async ({ data }) => {
    const userId = await callerUserId(data.accessToken);
    await assertDbSuperAdmin(data.accessToken, userId);

    const { data: req, error: rErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, status, days")
      .eq("id", data.requestId)
      .maybeSingle();
    if (rErr) throw new Response(rErr.message, { status: 500 });
    if (!req) throw new Response("Not found", { status: 404 });
    if (req.status !== "pending") throw new Response("Request is not pending", { status: 400 });

    const approverEmpId = await resolveApproverEmployeeId(userId);

    const { error: uErr } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: data.status,
        decided_at: new Date().toISOString(),
        approver_id: approverEmpId,
      })
      .eq("id", data.requestId);
    if (uErr) throw new Response(uErr.message, { status: 500 });

    if (data.status === "approved") {
      const y = yearFromIsoDate(req.start_date);
      await upsertBalanceFromApproved(req.employee_id, req.leave_type_id, y);
    }

    return { ok: true as const };
  });

const EnsureBalanceInput = z.object({
  accessToken: z.string().min(1),
});

/**
 * Ensures the signed-in user has a current-year balance row for the default leave type
 * with entitlement 10 days; `taken`/`remaining` follow approved requests.
 */
export const ensureMyAnnualLeaveBalance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EnsureBalanceInput.parse(data))
  .handler(async ({ data }) => {
    const userId = await callerUserId(data.accessToken);
    const caller = supabaseCaller(data.accessToken);

    const { data: prof } = await caller.from("profiles").select("employee_id").eq("id", userId).maybeSingle();
    let employeeId = prof?.employee_id ?? null;
    if (!employeeId) {
      const { data: authUser, error: auErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (auErr || !authUser.user?.email) throw new Response("Could not resolve employee (link profile or match team email).", { status: 400 });
      const email = authUser.user.email.trim();
      const { data: emp } = await supabaseAdmin.from("employees").select("id").ilike("email", email).maybeSingle();
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) throw new Response("No employee record for your account.", { status: 400 });

    const leaveTypeId = await pickDefaultLeaveTypeId();
    if (!leaveTypeId) throw new Response("No leave types configured in database.", { status: 500 });

    const year = new Date().getFullYear();
    await upsertBalanceFromApproved(employeeId, leaveTypeId, year);

    return { ok: true as const, employeeId, leaveTypeId, year };
  });
