import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Matches Team: profile.employee_id, else `employees.email` = signed-in email. */
export function useMyEmployeeId() {
  const auth = useAuth();
  const userId = auth.user?.id;
  const email = auth.user?.email?.trim().toLowerCase() ?? null;

  return useQuery({
    queryKey: ["my-employee-id", userId, email],
    queryFn: async (): Promise<string | null> => {
      if (!userId) return null;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("employee_id")
        .eq("id", userId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (prof?.employee_id) return prof.employee_id;
      if (!email) return null;
      const { data: emp, error: eErr } = await supabase.from("employees").select("id").ilike("email", email).maybeSingle();
      if (eErr) throw eErr;
      return emp?.id ?? null;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
