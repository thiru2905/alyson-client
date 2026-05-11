import { Drawer } from "@/components/Drawer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PrimaryBtn } from "@/components/forms/FormField";

type Grant = {
  id: string;
  security_type: string;
  total_shares: number;
  strike_price: number;
  grant_date: string;
  vesting_start: string;
  vesting_years: number;
  cliff_months: number;
  board_approved: boolean;
  certificate_id?: string | null;
  holder_name?: string;
};

export function GrantDrawer({ grant, onClose }: { grant: Grant | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: events } = useQuery({
    queryKey: ["vesting-events", grant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("vesting_events")
        .select("*")
        .eq("grant_id", grant!.id)
        .order("vest_date");
      return data ?? [];
    },
    enabled: !!grant,
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("equity_grants")
        .update({ board_approved: true })
        .eq("id", grant!.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        action: "equity.board_approve",
        entity_type: "equity_grant",
        entity_id: grant!.id,
        details: {},
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equity-holders"] });
      toast.success("Grant board-approved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Build a synthetic 8-year timeline if no events
  const series = events?.length
    ? events.map((e: any) => ({ date: e.vest_date, vested: Number(e.cumulative_vested) }))
    : grant ? buildSynthetic(grant) : [];

  return (
    <Drawer open={!!grant} onClose={onClose} title={grant ? `${grant.security_type.replace(/_/g, " ")} grant` : ""} eyebrow={grant?.holder_name ?? "Equity grant"} width="xl">
      {grant && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total shares" value={fmtNumber(Number(grant.total_shares))} />
            <Stat label="Strike" value={fmtCurrency(Number(grant.strike_price))} />
            <Stat label="Grant date" value={fmtDate(grant.grant_date)} />
            <Stat label="Cliff" value={`${grant.cliff_months}m`} />
          </div>

          <div className="surface-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Vesting schedule ({grant.vesting_years} years)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", year: "2-digit" })} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} formatter={(v) => fmtNumber(Number(v))} />
                <Line type="monotone" dataKey="vested" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[12px]">
              {grant.board_approved ? (
                <span className="pill pill-success"><CheckCircle2 className="h-3 w-3" />Board approved</span>
              ) : (
                <span className="pill pill-warning">Awaiting board approval</span>
              )}
              {grant.certificate_id && (
                <span className="ml-2 text-muted-foreground font-mono text-[11px]">Cert: {grant.certificate_id}</span>
              )}
            </div>
            {!grant.board_approved && (
              <PrimaryBtn onClick={() => approve.mutate()} disabled={approve.isPending}>
                Board approve
              </PrimaryBtn>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function buildSynthetic(g: Grant) {
  const months = g.vesting_years * 12;
  const perMonth = Number(g.total_shares) / months;
  const start = new Date(g.vesting_start);
  const out = [];
  let cum = 0;
  for (let m = 0; m <= months; m += 3) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + m);
    if (m < g.cliff_months) {
      out.push({ date: d.toISOString().slice(0, 10), vested: 0 });
    } else {
      cum = perMonth * m;
      out.push({ date: d.toISOString().slice(0, 10), vested: Math.min(cum, Number(g.total_shares)) });
    }
  }
  return out;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-[14px] mt-0.5 capitalize">{value}</div>
    </div>
  );
}
