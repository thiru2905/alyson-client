import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { WorkspaceActivityRow } from "@/lib/workspace-activity-types";

type Props = {
  filteredRows: WorkspaceActivityRow[];
};

export function WorkspaceActivityCharts({ filteredRows }: Props) {
  const totalsComparison = useMemo(() => {
    return [
      { metric: "Meetings", value: filteredRows.reduce((n, r) => n + r.meetingsCreated, 0) },
      { metric: "Docs", value: filteredRows.reduce((n, r) => n + r.docsCreated, 0) },
      { metric: "Chat", value: filteredRows.reduce((n, r) => n + r.chatMessagesSent, 0) },
      { metric: "Emails", value: filteredRows.reduce((n, r) => n + r.emailsSent, 0) },
    ];
  }, [filteredRows]);

  const topUsersComparison = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        const ta = a.meetingsCreated + a.docsCreated + a.chatMessagesSent;
        const tb = b.meetingsCreated + b.docsCreated + b.chatMessagesSent;
        return tb - ta || b.emailsSent - a.emailsSent;
      })
      .slice(0, 12)
      .map((r) => ({
        user: r.userEmail,
        meetings: r.meetingsCreated,
        docs: r.docsCreated,
        chat: r.chatMessagesSent,
        emails: r.emailsSent,
      }));
  }, [filteredRows]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="surface-card p-4 md:p-5">
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
          Totals comparison
        </div>
        <h3 className="font-display text-lg mt-0.5 mb-3">Meetings vs Docs vs Chat vs Emails</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={totalsComparison} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="metric" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "var(--paper)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" name="Count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="surface-card p-4 md:p-5">
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Top users</div>
        <h3 className="font-display text-lg mt-0.5 mb-3">Meetings / Docs / Chat comparison</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={topUsersComparison} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="user"
              stroke="var(--muted-foreground)"
              fontSize={10}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={70}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "var(--paper)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="meetings" name="Meetings" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="docs" name="Docs" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="chat" name="Chat" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
