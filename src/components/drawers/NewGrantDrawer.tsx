import { Drawer } from "@/components/Drawer";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

export function NewGrantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: holders } = useQuery({
    queryKey: ["holders-list"],
    queryFn: async () => {
      const { data } = await supabase.from("equity_holders").select("id, display_name, holder_type").order("display_name");
      return data ?? [];
    },
    enabled: open,
  });

  const [holderId, setHolderId] = useState("");
  const [securityType, setSecurityType] = useState<"options" | "rsu" | "common_share" | "preferred_share" | "warrant">("options");
  const [shares, setShares] = useState("10000");
  const [strike, setStrike] = useState("0.10");
  const today = new Date().toISOString().slice(0, 10);
  const [grantDate, setGrantDate] = useState(today);
  const [vestStart, setVestStart] = useState(today);
  const [years, setYears] = useState("4");
  const [cliff, setCliff] = useState("12");

  useEffect(() => {
    if (open && holders && holders.length && !holderId) setHolderId(holders[0].id);
  }, [open, holders, holderId]);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("equity_grants").insert({
        holder_id: holderId,
        security_type: securityType,
        total_shares: Number(shares),
        strike_price: Number(strike),
        grant_date: grantDate,
        vesting_start: vestStart,
        vesting_years: Number(years),
        cliff_months: Number(cliff),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equity-holders"] });
      toast.success("Grant created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create grant"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="New equity grant" eyebrow="Equity" width="lg">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!holderId) return toast.error("Pick a holder");
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          <Field label="Holder">
            <Select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
              <option value="">Select holder…</option>
              {(holders ?? []).map((h: any) => (
                <option key={h.id} value={h.id}>
                  {h.display_name} · {h.holder_type}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Security type">
              <Select value={securityType} onChange={(e) => setSecurityType(e.target.value as any)}>
                <option value="options">Options</option>
                <option value="rsu">RSU</option>
                <option value="common_share">Common share</option>
                <option value="preferred_share">Preferred share</option>
                <option value="warrant">Warrant</option>
              </Select>
            </Field>
            <Field label="Total shares">
              <TextInput type="number" value={shares} onChange={(e) => setShares(e.target.value)} required />
            </Field>
            <Field label="Strike price">
              <TextInput type="number" step="0.01" value={strike} onChange={(e) => setStrike(e.target.value)} />
            </Field>
            <Field label="Grant date">
              <TextInput type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} required />
            </Field>
            <Field label="Vesting start">
              <TextInput type="date" value={vestStart} onChange={(e) => setVestStart(e.target.value)} required />
            </Field>
            <Field label="Vesting years">
              <TextInput type="number" value={years} onChange={(e) => setYears(e.target.value)} />
            </Field>
            <Field label="Cliff (months)">
              <TextInput type="number" value={cliff} onChange={(e) => setCliff(e.target.value)} />
            </Field>
          </div>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Create grant</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
