import { Drawer } from "@/components/Drawer";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";
import { useAuth } from "@/lib/auth";
import { fetchOverview } from "@/lib/queries";
import { useMyEmployeeId } from "@/hooks/useMyEmployeeId";
import { ensureMyAnnualLeaveBalance } from "@/lib/leave-functions";

export function LeaveRequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const canRequestForOthers = auth.hasAnyRole(["super_admin", "hr", "manager"]);
  const myEmployee = useMyEmployeeId();

  const useOverviewForEmployees =
    String(import.meta.env.VITE_HR_OVERVIEW_SOURCE ?? "").trim().toLowerCase() === "s3" ||
    String(import.meta.env.VITE_DEMO_MODE ?? "").trim().toLowerCase() === "true";

  const ensureBalance = useMutation({
    mutationFn: async () => {
      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;
      const accessToken = sess.session?.access_token;
      if (!accessToken) return;
      await ensureMyAnnualLeaveBalance({ data: { accessToken } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: async (e: unknown) => {
      if (e instanceof Response) {
        toast.error(await e.text());
      }
    },
  });

  useEffect(() => {
    if (open) ensureBalance.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync allowance when drawer opens
  }, [open]);

  const { data: types } = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data } = await supabase.from("leave_types").select("*").order("name");
      return data ?? [];
    },
    enabled: open,
  });
  const { data: emps } = useQuery({
    queryKey: ["emps-list"],
    queryFn: async () => {
      if (useOverviewForEmployees) {
        const o = await fetchOverview();
        return (o.employees ?? [])
          .map((e) => ({ id: e.id, full_name: e.full_name }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name));
      }
      const { data } = await supabase.from("employees").select("id, full_name").order("full_name");
      return data ?? [];
    },
    enabled: open && canRequestForOthers,
  });

  const [empId, setEmpId] = useState("");
  const [typeId, setTypeId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && !canRequestForOthers && myEmployee.data) setEmpId(myEmployee.data);
    if (open && canRequestForOthers && emps?.length && !empId) setEmpId(emps[0].id);
    if (open && types?.length && !typeId) setTypeId(types[0].id);
  }, [open, emps, types, empId, typeId, canRequestForOthers, myEmployee.data]);

  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1;
  const requestedDays = Math.max(1, days);

  const create = useMutation({
    mutationFn: async () => {
      if (!empId) {
        throw new Error(
          canRequestForOthers
            ? "Please select an employee"
            : "Your account is not linked to an employee record. Ask an admin to link your profile, or use the same email as your Team profile.",
        );
      }
      const year = Number(start.slice(0, 4));
      const { data: bal, error: bErr } = await supabase
        .from("leave_balances")
        .select("remaining")
        .eq("employee_id", empId)
        .eq("leave_type_id", typeId)
        .eq("year", year)
        .maybeSingle();
      if (bErr) throw bErr;
      if (bal != null && Number(bal.remaining) < requestedDays) {
        throw new Error(`Not enough balance: ${Number(bal.remaining).toFixed(1)} days left for this type in ${year} (annual allowance 10).`);
      }

      const { error } = await supabase.from("leave_requests").insert({
        employee_id: empId,
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        days: requestedDays,
        reason: reason || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["pending-leave-for-bell"] });
      toast.success("Leave request submitted");
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="Request leave" eyebrow="Leave" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1">
          {!canRequestForOthers && myEmployee.isSuccess && !myEmployee.data && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              No employee linked to your account. Match your login email to an employee on Team, or ask an admin to link your profile.
            </div>
          )}
          {canRequestForOthers && (
            <Field label="Employee">
              <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {(emps ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Leave type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {(types ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="End date">
              <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
          </div>
          <div className="text-[12px] text-muted-foreground">
            {Math.max(1, Math.round(requestedDays))} day{requestedDays !== 1 ? "s" : ""} requested (pending super admin approval).
          </div>
          <Field label="Reason">
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending || ensureBalance.isPending}>
            Submit request
          </PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
