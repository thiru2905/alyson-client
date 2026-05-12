import { Drawer } from "@/components/Drawer";
import { Field, TextInput, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createEmployeeAndUserAsAdmin } from "@/lib/admin-functions";

export function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    data: deps,
    isError: depsError,
    error: depsQueryError,
  } = useQuery({
    queryKey: ["departments-create-user"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [role, setRole] = useState<string>("Employee");
  const [level, setLevel] = useState<string>("1");
  const [hireDate, setHireDate] = useState<string>(today);

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setEmail("");
    setDepartmentId("");
    setRole("Employee");
    setLevel("1");
    setHireDate(today);
  }, [open, today]);

  useEffect(() => {
    if (!open) return;
    if (!deps?.length) return;
    const validIds = new Set(deps.map((d) => d.id));
    if (!departmentId || !validIds.has(departmentId)) {
      setDepartmentId(deps[0]!.id);
    }
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
          departmentId,
          role,
          level,
          hireDate,
        },
      });
      return res;
    },
    onSuccess: () => {
      toast.success("Employee + user created", {
        description: "A secure temporary password was set — use password reset to sign in.",
      });
      onClose();
    },
    onError: async (e: unknown) => {
      if (e instanceof Response) {
        toast.error(await e.text());
        return;
      }
      const msg = e instanceof Error ? e.message : "Failed to create user";
      toast.error(msg);
    },
  });

  const canSubmit =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    Boolean(departmentId) &&
    (deps?.length ?? 0) > 0 &&
    !create.isPending;

  return (
    <Drawer open={open} onClose={onClose} title="Create user" eyebrow="Admin" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
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
              {(deps ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
              Departments come from your Supabase database (UUID ids). HR overview / demo datasets use different ids
              and cannot be used here.
            </p>
          </Field>

          {depsError && (
            <p className="text-[12px] text-destructive">
              Could not load departments: {depsQueryError instanceof Error ? depsQueryError.message : "Unknown error"}
            </p>
          )}

          {!depsError && deps && deps.length === 0 && (
            <p className="text-[12px] text-muted-foreground">
              No departments found. Add rows to the <code className="text-[11px]">departments</code> table in Supabase
              before creating users.
            </p>
          )}

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
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <PrimaryBtn type="submit" disabled={!canSubmit}>
            Create
          </PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
