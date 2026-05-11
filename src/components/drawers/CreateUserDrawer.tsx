import { Drawer } from "@/components/Drawer";
import { Field, TextInput, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createEmployeeAndUserAsAdmin } from "@/lib/admin-functions";
import { fetchOverview } from "@/lib/queries";

export function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const useOverviewForDeps =
    String(import.meta.env.VITE_HR_OVERVIEW_SOURCE ?? "").trim().toLowerCase() === "s3" ||
    String(import.meta.env.VITE_DEMO_MODE ?? "").trim().toLowerCase() === "true";

  const { data: deps } = useQuery({
    queryKey: ["departments-create-user"],
    queryFn: async () => {
      if (useOverviewForDeps) {
        const o = await fetchOverview();
        return o.departments;
      }
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [role, setRole] = useState<string>("Employee");
  const [level, setLevel] = useState<string>("1");
  const [hireDate, setHireDate] = useState<string>(today);

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("Employee");
    setLevel("1");
    setHireDate(today);
  }, [open, today]);

  useEffect(() => {
    if (!open) return;
    if (!departmentId && deps?.length) setDepartmentId(deps[0].id);
  }, [open, departmentId, deps]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("Not signed in");

      const res = await createEmployeeAndUserAsAdmin({
        data: {
          accessToken,
          fullName,
          email,
          password,
          departmentId,
          role,
          level,
          hireDate,
        },
      });
      return res;
    },
    onSuccess: () => {
      toast.success("Employee + user created");
      onClose();
    },
    onError: async (e: any) => {
      // ServerFn errors can arrive as Response
      if (e instanceof Response) {
        toast.error(await e.text());
        return;
      }
      toast.error(e?.message ?? "Failed to create user");
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="Create user" eyebrow="Admin" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1">
          <Field label="Full name">
            <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>

          <Field label="Department">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
              <option value="">Select a department…</option>
              {(deps ?? []).map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <TextInput value={role} onChange={(e) => setRole(e.target.value)} required />
            </Field>
            <Field label="Level">
              <TextInput value={level} onChange={(e) => setLevel(e.target.value)} required />
            </Field>
          </div>

          <Field label="Hire date">
            <TextInput type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} required />
          </Field>

          <Field label="Email">
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </Field>
          <Field label="Password">
            <TextInput value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>
            Create
          </PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}

