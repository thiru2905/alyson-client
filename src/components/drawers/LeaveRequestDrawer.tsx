import { Drawer } from "@/components/Drawer";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";
import { useAuth } from "@/lib/auth";
import { fetchOverview } from "@/lib/queries";

export function LeaveRequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const canRequestForOthers = auth.hasAnyRole(["super_admin", "hr", "manager"]);

  const useOverviewForEmployees =
    String(import.meta.env.VITE_HR_OVERVIEW_SOURCE ?? "").trim().toLowerCase() === "s3" ||
    String(import.meta.env.VITE_DEMO_MODE ?? "").trim().toLowerCase() === "true";

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", auth.user?.id],
    queryFn: async () => {
      if (!auth.user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, employee_id")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!auth.user?.id,
  });

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
      const { data } = await supabase
        .from("employees")
        .select("id, full_name")
        .order("full_name");
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
    // Regular employees can only request for themselves (RLS requires employee_id to match profile.employee_id)
    if (open && !canRequestForOthers && myProfile?.employee_id) setEmpId(myProfile.employee_id);

    // Admin/HR/Manager can request on behalf of others
    if (open && canRequestForOthers && emps?.length && !empId) setEmpId(emps[0].id);
    if (open && types?.length && !typeId) setTypeId(types[0].id);
  }, [open, emps, types, empId, typeId, canRequestForOthers, myProfile?.employee_id]);

  const days =
    (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1;

  const create = useMutation({
    mutationFn: async () => {
      if (!empId) {
        throw new Error(
          canRequestForOthers
            ? "Please select an employee"
            : "Your account is not linked to an employee record. Ask an admin to link your user to an employee."
        );
      }
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: empId,
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        days: Math.max(1, days),
        reason: reason || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave request submitted");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
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
          {canRequestForOthers && (
            <Field label="Employee">
              <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {(emps ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Leave type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {(types ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
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
            {Math.max(1, Math.round(days))} day{days !== 1 ? "s" : ""} requested.
          </div>
          <Field label="Reason">
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Submit request</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
