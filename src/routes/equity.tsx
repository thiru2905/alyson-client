import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchEquityHolders } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { fmtNumber, fmtCurrency } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { PieChart as PieIcon, Plus, Download } from "lucide-react";
import { useState } from "react";
import { NewGrantDrawer } from "@/components/drawers/NewGrantDrawer";
import { GrantDrawer } from "@/components/drawers/GrantDrawer";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/equity")({
  head: () => ({ meta: [{ title: "Equity — Alyson HR" }] }),
  component: EquityPage,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function EquityPage() {
  const { data, isLoading } = useQuery({ queryKey: ["equity-holders"], queryFn: fetchEquityHolders });
  const [newOpen, setNewOpen] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);

  if (isLoading) return <PageSkeleton />;
  const holders = data ?? [];

  const all = holders.flatMap((h: any) => (h.equity_grants ?? []).map((g: any) => ({ ...g, holder_type: h.holder_type, holder_name: h.display_name })));
  const totalShares = all.reduce((s, g) => s + Number(g.total_shares), 0);
  const byType = ["employee", "founder", "investor", "advisor"].map((t) => ({
    name: t.charAt(0).toUpperCase() + t.slice(1),
    value: all.filter((g) => g.holder_type === t).reduce((s, g) => s + Number(g.total_shares), 0),
  })).filter((d) => d.value > 0);

  const exportCap = () => {
    if (!all.length) return toast.error("Cap table is empty");
    downloadCSV(
      `cap-table-${new Date().toISOString().slice(0, 10)}.csv`,
      all.map((g) => ({
        holder: g.holder_name,
        type: g.holder_type,
        security: g.security_type,
        shares: g.total_shares,
        strike: g.strike_price,
        grant_date: g.grant_date,
        vesting_start: g.vesting_start,
        vesting_years: g.vesting_years,
        cliff_months: g.cliff_months,
        board_approved: g.board_approved ? "yes" : "no",
      })),
    );
    toast.success("Cap table exported");
  };

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Money"
        title="Equity & Cap Table"
        description="Grants, vesting, and ownership across all holders."
        dense
        actions={
          <>
            <button onClick={exportCap} className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"><Download className="h-3.5 w-3.5" />Cap table</button>
            <button onClick={() => setNewOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />New grant</button>
          </>
        }
      />
      <div className="px-5 md:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Total shares granted" value={fmtNumber(totalShares)} />
          <Stat label="Holders" value={String(holders.length)} />
          <Stat label="Active grants" value={String(all.length)} />
        </div>

        {all.length === 0 ? (
          <EmptyState
            icon={PieIcon}
            title="No equity grants yet"
            description="Add your founders, investors, and employee option grants to populate the cap table."
            action={<button onClick={() => setNewOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5 mx-auto"><Plus className="h-3.5 w-3.5" />New grant</button>}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="surface-card p-4 md:p-5">
              <h3 className="font-display text-lg mb-3">Cap table by holder type</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                    {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-2">
              <TableScroll>
                <table className="ops-table w-full">
                  <thead><tr><th align="left">Holder</th><th align="left">Type</th><th align="left">Security</th><th align="right">Shares</th><th align="right">Strike</th><th align="left">Grant date</th><th align="left">Cliff</th><th>Status</th></tr></thead>
                  <tbody>
                    {all.slice(0, 25).map((g) => (
                      <tr key={g.id} onClick={() => setPicked(g)} className="hover:bg-muted/40 cursor-pointer">
                        <td>{g.holder_name}</td>
                        <td><span className="pill pill-neutral capitalize">{g.holder_type}</span></td>
                        <td className="text-muted-foreground capitalize">{g.security_type.replace(/_/g, " ")}</td>
                        <td align="right" className="font-mono">{fmtNumber(Number(g.total_shares))}</td>
                        <td align="right" className="font-mono text-muted-foreground">{fmtCurrency(Number(g.strike_price))}</td>
                        <td className="text-muted-foreground">{new Date(g.grant_date).toLocaleDateString()}</td>
                        <td className="text-muted-foreground">{g.cliff_months ? `${g.cliff_months}m` : "—"}</td>
                        <td>{g.board_approved ? <span className="pill pill-success">Approved</span> : <span className="pill pill-warning">Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </div>
        )}
      </div>

      <NewGrantDrawer open={newOpen} onClose={() => setNewOpen(false)} />
      <GrantDrawer grant={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="surface-card p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div><div className="font-display text-2xl mt-1">{value}</div></div>;
}
