import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateUserInput = z.object({
  accessToken: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  employeeId: z.string().uuid().optional(),
});

export const createUserAsAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateUserInput.parse(data))
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Missing server Supabase env vars", { status: 500 });
    }

    // Auth the caller using their access token (since client auth is stored in localStorage, not request headers)
    const caller = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: claims, error: claimsErr } = await caller.auth.getClaims(data.accessToken);
    if (claimsErr || !claims?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
    const callerUserId = claims.claims.sub;

    // Ensure caller is a real DB super_admin (not just demo-role override)
    const { data: roles, error: rolesErr } = await caller
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "super_admin");

    if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
    if (!roles || roles.length === 0) throw new Response("Forbidden", { status: 403 });

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (error || !created?.user?.id) {
      throw new Response(error?.message ?? "Failed to create user", { status: 400 });
    }

    // Link user -> employee (required for leave request RLS)
    // If employeeId isn't provided, attempt to auto-link by matching employees.email = user email.
    let employeeId = data.employeeId;
    if (!employeeId) {
      const { data: emp, error: empErr } = await supabaseAdmin
        .from("employees")
        .select("id")
        .ilike("email", data.email)
        .maybeSingle();
      if (empErr) throw new Response(empErr.message, { status: 400 });
      employeeId = emp?.id ?? undefined;
    }

    if (!employeeId) {
      // User can still exist, but they won't be able to request leave. Make this explicit.
      throw new Response(
        "User created, but not linked to an employee. Create/select an employee record and link the user from Admin → Users & roles.",
        { status: 400 }
      );
    }

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ employee_id: employeeId })
      .eq("id", created.user.id);

    if (profileErr) throw new Response(profileErr.message, { status: 400 });

    return { userId: created.user.id };
  });

const CreateEmployeeUserInput = z.object({
  accessToken: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  departmentId: z.string().uuid(),
  role: z.string().min(2),
  level: z.string().min(1),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createEmployeeAndUserAsAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateEmployeeUserInput.parse(data))
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Missing server Supabase env vars", { status: 500 });
    }

    const caller = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: claims, error: claimsErr } = await caller.auth.getClaims(data.accessToken);
    if (claimsErr || !claims?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
    const callerUserId = claims.claims.sub;

    const { data: roles, error: rolesErr } = await caller
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "super_admin");

    if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
    if (!roles || roles.length === 0) throw new Response("Forbidden", { status: 403 });

    // 1) Create employee row (so they show up in Team dashboard)
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .insert({
        full_name: data.fullName,
        email: data.email,
        role: data.role,
        level: data.level,
        department_id: data.departmentId,
        hire_date: data.hireDate,
      })
      .select("id")
      .single();

    if (empErr) throw new Response(empErr.message, { status: 400 });

    // 2) Create auth user (persisted, can login immediately)
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (error || !created?.user?.id) {
      throw new Response(error?.message ?? "Failed to create user", { status: 400 });
    }

    // 3) Link profile -> employee
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ employee_id: emp.id, display_name: data.fullName })
      .eq("id", created.user.id);

    if (profileErr) throw new Response(profileErr.message, { status: 400 });

    return { userId: created.user.id, employeeId: emp.id };
  });

const DeleteUserInput = z.object({
  accessToken: z.string().min(1),
  userId: z.string().uuid(),
});

export const deleteUserAsAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteUserInput.parse(data))
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Missing server Supabase env vars", { status: 500 });
    }

    const caller = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: claims, error: claimsErr } = await caller.auth.getClaims(data.accessToken);
    if (claimsErr || !claims?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
    const callerUserId = claims.claims.sub;

    const { data: roles, error: rolesErr } = await caller
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "super_admin");

    if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
    if (!roles || roles.length === 0) throw new Response("Forbidden", { status: 403 });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Response(error.message, { status: 400 });

    return { ok: true };
  });

const LinkUserEmployeeInput = z.object({
  accessToken: z.string().min(1),
  userId: z.string().uuid(),
  employeeId: z.string().uuid().nullable(),
});

export const linkUserToEmployeeAsAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkUserEmployeeInput.parse(data))
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Missing server Supabase env vars", { status: 500 });
    }

    const caller = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: claims, error: claimsErr } = await caller.auth.getClaims(data.accessToken);
    if (claimsErr || !claims?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
    const callerUserId = claims.claims.sub;

    const { data: roles, error: rolesErr } = await caller
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "super_admin");

    if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
    if (!roles || roles.length === 0) throw new Response("Forbidden", { status: 403 });

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ employee_id: data.employeeId })
      .eq("id", data.userId);
    if (error) throw new Response(error.message, { status: 400 });

    return { ok: true };
  });

