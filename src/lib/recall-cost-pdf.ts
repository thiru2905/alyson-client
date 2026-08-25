import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { RecallCostReport } from "@/lib/recall-cost-report.server";

function usd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function hours(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n < 10 ? `${n.toFixed(1)}h` : `${Math.round(n)}h`;
}

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function recallCostReportFilename(report: RecallCostReport) {
  return `alyson-recall-cost_${report.range.start}_${report.range.end}.pdf`;
}

export function downloadRecallCostReportPdf(report: RecallCostReport) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  const addPageIfNeeded = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Alyson Recall Cost Report", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const line of [
    `Period: ${report.range.start} → ${report.range.end}`,
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    `Rates: bot ${usd(report.costs.botHourRateUsd)}/hr + transcript ${usd(report.costs.transcriptHourRateUsd)}/hr = ${usd(report.costs.combinedHourRateUsd)}/hr`,
  ]) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const line of [
    `Total cost (period): ${usd(report.costs.totalUsageCostUsd)}`,
    `Bot cost: ${usd(report.costs.botUsageCostUsd)} · Transcript cost: ${usd(report.costs.transcriptUsageCostUsd)}`,
    `Bot hours: ${hours(report.usage.botTotalHours)}`,
    `S3 meetings: ${report.meetings.total} · with Recall bot: ${report.meetings.withBot}`,
    `Avg cost / Recall bot: ${usd(report.costs.costPerRecallMeetingUsd)}`,
    `Avg cost / S3 meeting: ${usd(report.costs.costPerMeetingUsd)}`,
    `This calendar month: ${usd(report.calendarMonth.totalUsageCostUsd)} (${hours(report.calendarMonth.botTotalHours)})`,
  ]) {
    addPageIfNeeded(14);
    doc.text(line, margin, y);
    y += 14;
  }
  y += 12;

  const byUser = report.byUser ?? [];
  if (byUser.length) {
    addPageIfNeeded(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cost / users", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["User", "Meetings", "With bot", "Est. cost", "Share"]],
      body: byUser.map((r) => [
        r.email,
        String(r.meetings),
        String(r.withBot),
        usd(r.estimatedCostUsd),
        pct(r.shareOfTotal),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: margin, right: margin },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    y += 16;
  }

  const byUserMonth = report.byUserMonth ?? [];
  if (byUserMonth.length) {
    addPageIfNeeded(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cost / users per month", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Month", "User", "Meetings", "Est. cost"]],
      body: byUserMonth.map((r) => [
        r.month,
        r.email,
        String(r.meetings),
        usd(r.estimatedCostUsd),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: margin, right: margin },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    y += 16;
  }

  const byMeeting = (report.byMeeting ?? []).slice(0, 80);
  if (byMeeting.length) {
    addPageIfNeeded(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cost / meetings (top by cost)", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Day", "Title", "User", "Est. cost"]],
      body: byMeeting.map((r) => [
        r.day,
        r.title.length > 42 ? `${r.title.slice(0, 40)}…` : r.title,
        r.userEmail,
        usd(r.estimatedCostUsd),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: margin, right: margin },
      columnStyles: {
        1: { cellWidth: 180 },
      },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    y += 14;
  }

  const dailyWithSpend = report.daily.filter((d) => d.totalCostUsd > 0 || d.meetings > 0);
  if (dailyWithSpend.length) {
    addPageIfNeeded(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Daily cost", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Day", "Meetings", "Bot hours", "Bot $", "Transcript $", "Total $"]],
      body: dailyWithSpend.map((d) => [
        d.day,
        String(d.meetings),
        hours(d.botHours),
        usd(d.botCostUsd),
        usd(d.transcriptCostUsd),
        usd(d.totalCostUsd),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: margin, right: margin },
    });
  }

  doc.save(recallCostReportFilename(report));
}
