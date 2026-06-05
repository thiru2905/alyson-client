import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { NotetakerAnalyticsReport } from "@/lib/notetaker-analytics.server";
import {
  analyticsExportFilename,
  buildMeetingTranscriptUrl,
  buildTalkTimeShareSlices,
} from "@/lib/notetaker-analytics-export";

function formatPeriodLabel(report: NotetakerAnalyticsReport, periodLabel?: string) {
  if (periodLabel?.trim()) return periodLabel.trim();
  return `${report.range.start} → ${report.range.end}`;
}

function meetingSpeakerShareLine(speakers: Array<{ speaker: string; words: number }>) {
  const total = speakers.reduce((n, s) => n + s.words, 0);
  if (total <= 0) return "—";
  return speakers
    .slice(0, 6)
    .map((s) => `${s.speaker} ${((s.words / total) * 100).toFixed(1)}%`)
    .join(" · ");
}

export function downloadAnalyticsPdf(args: {
  report: NotetakerAnalyticsReport;
  origin: string;
  periodLabel?: string;
  insightsMd?: string | null;
}) {
  const { report, origin, insightsMd } = args;
  const period = formatPeriodLabel(report, args.periodLabel);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
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
  doc.text("Meeting analytics report", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta: string[] = [
    `Period: ${period}`,
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
  ];
  meta.push(
    report.filters.speakers.length
      ? `Speakers: ${report.filters.speakers.join(", ")}`
      : "Speakers: All",
  );
  const meetingPrefixes = report.filters.meetingPrefixes ?? [];
  if (meetingPrefixes.length > 0) {
    const titles = report.meetings.map((m) => m.title);
    meta.push(`Meetings (${titles.length}): ${titles.slice(0, 3).join("; ")}${titles.length > 3 ? "…" : ""}`);
  } else if (report.filters.meetingTitle) {
    meta.push(`Title filter: ${report.filters.meetingTitle}`);
  } else {
    meta.push("Meetings: All");
  }
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summary = [
    `Meetings in range: ${report.meetingCount}`,
    `Analyzed (with transcript): ${report.analyzedCount}`,
    `Unique speakers: ${report.uniqueSpeakersGlobal}`,
    `Total utterances: ${report.totalUtterances}`,
    `Total words: ${report.totalWords.toLocaleString()}`,
  ];
  for (const line of summary) {
    doc.text(line, margin, y);
    y += 13;
  }
  y += 8;

  const talkSlices = buildTalkTimeShareSlices(report);
  if (talkSlices.length) {
    addPageIfNeeded(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Talk-time share (% of words spoken)", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Word share proxies airtime when transcripts lack per-segment duration.", margin, y + 10);
    y += 22;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Speaker", "Talk time", "Words"]],
      body: talkSlices.map((s) => [
        s.name,
        `${s.percent.toFixed(1)}%`,
        s.words.toLocaleString(),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    y += 16;
  }

  if (insightsMd?.trim()) {
    addPageIfNeeded(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("AI insights", margin, y);
    y += 14;
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(insightsMd.trim(), pageW - margin * 2);
    for (const line of lines) {
      addPageIfNeeded(12);
      doc.text(line, margin, y);
      y += 10;
    }
    y += 10;
    doc.setFont("helvetica", "normal");
  }

  addPageIfNeeded(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Top speakers", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y + 10,
    margin: { left: margin, right: margin },
    head: [["Speaker", "Utterances", "Words", "Meetings"]],
    body: report.topSpeakers.slice(0, 25).map((s) => [
      s.speaker,
      String(s.utterances),
      String(s.words),
      String(s.meetingsSpoken),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
  });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  y += 16;

  const meetingUrls = report.meetings.map((m) =>
    buildMeetingTranscriptUrl(origin, { day: m.day, transcriptKey: m.transcriptKey }),
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Meetings (titles link to transcript)", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y + 10,
    margin: { left: margin, right: margin },
    head: [["Day", "Meeting", "Spk", "Utter.", "Words", "Talk-time share"]],
    body: report.meetings.map((m) => [
      m.day,
      m.title,
      String(m.uniqueSpeakers),
      String(m.totalUtterances),
      String(m.totalWords),
      meetingSpeakerShareLine(m.speakers),
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 110 },
      5: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        data.cell.styles.textColor = [11, 87, 208];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const url = meetingUrls[data.row.index];
      if (!url) return;
      doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
    },
  });

  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Exported from Alyson Notetaker · ${origin}`, margin, footerY);

  doc.save(`${analyticsExportFilename(report)}.pdf`);
}
