import { format } from "date-fns";
import { jsPDF } from "jspdf";
import type { AlysonBrainDashboardPayload, AlysonBrainInsights } from "@/lib/alyson-brain/alyson-brain-types";

export function downloadAlysonBrainPdf(args: {
  dashboard: AlysonBrainDashboardPayload;
  insights: AlysonBrainInsights | null;
  question: string;
}) {
  const { dashboard, insights, question } = args;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;

  const addPageIfNeeded = (needed = 14) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Alyson Brain Report", margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${dashboard.range.label}`, margin, y);
  y += 14;
  const qLines = doc.splitTextToSize(`Question: ${question}`, maxW);
  doc.text(qLines, margin, y);
  y += qLines.length * 12 + 16;

  for (const emp of dashboard.employees) {
    addPageIfNeeded(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(emp.employee.displayName, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = [
      `Score: ${emp.scoring?.compositeScore ?? "—"} (Grade ${emp.scoring?.grade ?? "—"}, Rank #${emp.scoring?.rank ?? "—"})`,
      `Hours: ${emp.timeDoctor?.rangeHours ?? emp.scoring?.workHours ?? "—"}h range · ${emp.timeDoctor?.monthlyHours ?? "—"}h month`,
      `Leave: ${emp.leave?.daysTakenInRange ?? "—"} days · Bonus: $${emp.bonus?.bonusPaidUsd ?? 0}`,
      `Meetings: ${emp.meetings?.meetingsAttended ?? "—"} · Tasks: ${emp.tasks?.taskCount ?? "—"}`,
    ];
    for (const line of lines) {
      addPageIfNeeded(12);
      doc.text(line, margin, y);
      y += 12;
    }
    y += 8;
  }

  if (insights?.narrative) {
    addPageIfNeeded(30);
    doc.setFont("helvetica", "bold");
    doc.text("Insights", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const narrative = doc.splitTextToSize(insights.narrative, maxW);
    for (const line of narrative) {
      addPageIfNeeded(12);
      doc.text(line, margin, y);
      y += 12;
    }
  }

  const slug =
    dashboard.employees.map((e) => e.employee.displayName).join("-").replace(/[^a-z0-9]+/gi, "-").slice(0, 40) ||
    "report";
  doc.save(`alyson-brain-${slug}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
