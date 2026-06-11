import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  pacingFilterSummaryLabel,
  type WeeklyHoursTrendPoint,
  type WeeklyHoursTrendReport,
} from "@/lib/weekly-pacing";

type Rgb = [number, number, number];

function shortWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function chartYMax(points: WeeklyHoursTrendPoint[], targetHours: number, priorAvg: number): number {
  const peak = Math.max(targetHours, priorAvg, ...points.map((p) => p.avgHoursWorked), 1);
  return Math.ceil(peak / 4) * 4 + 4;
}

function drawDashedHLine(
  doc: jsPDF,
  x1: number,
  x2: number,
  y: number,
  color: Rgb,
  dash = 4,
) {
  doc.setDrawColor(color[0], color[1], color[2]);
  let x = x1;
  while (x < x2) {
    const segEnd = Math.min(x + dash, x2);
    doc.line(x, y, segEnd, y);
    x += dash * 2;
  }
}

function drawWeeklyHoursLineChart(args: {
  doc: jsPDF;
  x: number;
  y: number;
  w: number;
  h: number;
  points: WeeklyHoursTrendPoint[];
  priorAverageHours: number;
  targetHours: number;
}) {
  const { doc, x, y, w, h, points, priorAverageHours, targetHours } = args;
  if (!points.length) return;

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yMax = chartYMax(points, targetHours, priorAverageHours);

  const toX = (i: number) => plotX + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const toY = (v: number) => plotY + plotH - (v / yMax) * plotH;

  doc.setDrawColor(230);
  doc.setLineWidth(0.5);
  doc.rect(plotX, plotY, plotW, plotH);

  const gridSteps = 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  for (let i = 0; i <= gridSteps; i++) {
    const val = (yMax / gridSteps) * i;
    const gy = toY(val);
    doc.setDrawColor(240);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.text(`${val.toFixed(0)}h`, x + 4, gy + 2);
  }

  drawDashedHLine(doc, plotX, plotX + plotW, toY(priorAverageHours), [234, 88, 12]);
  drawDashedHLine(doc, plotX, plotX + plotW, toY(targetHours), [120, 120, 120], 3);

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.8);
  for (let i = 1; i < points.length; i++) {
    doc.line(toX(i - 1), toY(points[i - 1]!.avgHoursWorked), toX(i), toY(points[i]!.avgHoursWorked));
  }

  for (let i = 0; i < points.length; i++) {
    const px = toX(i);
    const py = toY(points[i]!.avgHoursWorked);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(1.5);
    doc.circle(px, py, 3.5, "FD");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(shortWeekLabel(points[i]!.weekStart), px - 12, plotY + plotH + 14, { maxWidth: 28 });
  }
}

function renderWeeklyHoursTrendPdf(
  doc: jsPDF,
  args: {
    trend: WeeklyHoursTrendReport;
    chartFilterSummary?: string | null;
  },
) {
  const { trend, chartFilterSummary } = args;
  const margin = 28;
  const pageW = doc.internal.pageSize.getWidth();
  const liftPositive = trend.liftHours >= 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text("Weekly Hours Trend", margin, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(trend.company.name, margin, 44);
  doc.text(
    `${trend.weekCount}-week average logged hours per active employee (Active = Yes)`,
    margin,
    56,
  );
  doc.text(`Generated: ${new Date(trend.generatedAt).toLocaleString()} · ${trend.timeZoneLabel}`, margin, 68);
  if (chartFilterSummary) {
    doc.text(`Chart filters: ${chartFilterSummary}`, margin, 80);
  }

  const kpiY = chartFilterSummary ? 96 : 84;
  const kpiW = 118;
  const gap = 8;
  const kpis: Array<{ label: string; value: string; sub: string; fill: Rgb; text: Rgb }> = [
    {
      label: "Prior 7-week avg",
      value: `${trend.priorAverageHours.toFixed(1)}h`,
      sub: "Baseline before latest week",
      fill: [245, 245, 245],
      text: [30, 30, 30],
    },
    {
      label: "Latest week",
      value: trend.latestWeek ? `${trend.latestWeek.avgHoursWorked.toFixed(1)}h` : "—",
      sub: trend.latestWeek ? `${trend.latestWeek.employeeCount} employees` : "No data",
      fill: [245, 245, 245],
      text: [30, 30, 30],
    },
    {
      label: "Lift vs baseline",
      value: `${trend.liftHours >= 0 ? "+" : ""}${trend.liftHours.toFixed(1)}h`,
      sub: `${trend.liftPct >= 0 ? "+" : ""}${trend.liftPct}% vs prior avg`,
      fill: liftPositive ? [236, 253, 245] : [255, 247, 237],
      text: liftPositive ? [4, 120, 87] : [194, 65, 12],
    },
  ];

  for (let i = 0; i < kpis.length; i++) {
    const k = kpis[i]!;
    const kx = margin + i * (kpiW + gap);
    doc.setFillColor(k.fill[0], k.fill[1], k.fill[2]);
    doc.roundedRect(kx, kpiY, kpiW, 48, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(k.label, kx + 8, kpiY + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(k.text[0], k.text[1], k.text[2]);
    doc.text(k.value, kx + 8, kpiY + 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(k.sub, kx + 8, kpiY + 40);
  }

  const chartY = kpiY + 64;
  const chartH = 220;
  drawWeeklyHoursLineChart({
    doc,
    x: margin,
    y: chartY,
    w: pageW - margin * 2,
    h: chartH,
    points: trend.points,
    priorAverageHours: trend.priorAverageHours,
    targetHours: trend.targetHours,
  });

  let legendY = chartY + chartH + 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.setFillColor(37, 99, 235);
  doc.rect(margin, legendY - 4, 14, 2, "F");
  doc.text("Weekly avg hours", margin + 18, legendY);
  drawDashedHLine(doc, margin + 120, margin + 134, legendY - 2, [234, 88, 12]);
  doc.text("Prior 7-week baseline", margin + 138, legendY);
  drawDashedHLine(doc, margin + 250, margin + 264, legendY - 2, [120, 120, 120], 3);
  doc.text(`${trend.targetHours}h target`, margin + 268, legendY);

  if (trend.latestWeek) {
    legendY += 16;
    const delta = trend.latestWeek.avgHoursWorked - trend.priorAverageHours;
    doc.setTextColor(20);
    doc.text(
      `Latest week (${trend.latestWeek.weekLabel}): ${trend.latestWeek.avgHoursWorked.toFixed(1)}h avg · ${trend.latestWeek.employeeCount} employees · vs baseline ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}h`,
      margin,
      legendY,
      { maxWidth: pageW - margin * 2 },
    );
  }

  const tableStartY = legendY + 20;
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin },
    head: [["Week", "Employees", "Avg hours", "Total hours", "vs baseline"]],
    body: trend.points.map((p) => {
      const delta = p.avgHoursWorked - trend.priorAverageHours;
      return [
        p.weekLabel + (p.isCurrentWeek ? " (current)" : ""),
        String(p.employeeCount),
        `${p.avgHoursWorked.toFixed(1)}h`,
        `${p.totalHoursWorked.toFixed(1)}h`,
        `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}h`,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 180 },
      1: { halign: "right", cellWidth: 72 },
      2: { halign: "right", cellWidth: 72 },
      3: { halign: "right", cellWidth: 80 },
      4: { halign: "right", cellWidth: 80 },
    },
  });

  if (trend.warnings.length) {
    let noteY =
      ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStartY) + 16;
    const pageH = doc.internal.pageSize.getHeight();
    if (noteY > pageH - 40) {
      doc.addPage();
      noteY = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(20);
    doc.text("Notes", margin, noteY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    let y = noteY + 10;
    for (const w of trend.warnings) {
      doc.text(`• ${w}`, margin, y, { maxWidth: pageW - margin * 2 });
      y += 10;
    }
  }
}

export function downloadWeeklyHoursTrendPdf(args: {
  trend: WeeklyHoursTrendReport;
  chartFilterSummary?: string | null;
  filename?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  renderWeeklyHoursTrendPdf(doc, args);
  const slug = args.filename?.trim();
  const latest = args.trend.latestWeek?.weekStart ?? new Date().toISOString().slice(0, 10);
  doc.save(slug || `weekly-hours-trend-${latest}.pdf`);
}

export function chartFilterSummaryFromTrend(trend: WeeklyHoursTrendReport): string | null {
  return pacingFilterSummaryLabel({
    location: trend.filters.location,
    team: trend.filters.team,
    active: "__all__",
  });
}
