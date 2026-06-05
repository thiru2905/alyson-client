import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { HourlyActivityRow } from "@/lib/hourly-activity-types";

export type HourlyPdfMeta = {
  rows: HourlyActivityRow[];
  displayName: string;
  userEmail: string;
  range: { start: string; end: string };
  generatedAt: string;
};

function fmtIst(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function renderHourlyActivityPdf(doc: jsPDF, args: HourlyPdfMeta) {
  const { rows, displayName, userEmail, range, generatedAt } = args;
  const margin = 24;
  const pageW = doc.internal.pageSize.getWidth();

  const workingRows = rows.filter((r) => r.working === "Yes").length;
  const totalCredit = rows.reduce((n, r) => n + r.hoursCredit, 0);
  const totalActive = rows.reduce((n, r) => n + r.activeMinutes, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Hourly Activity Report", margin, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${displayName} · ${userEmail}`, margin, 42);
  doc.text(`Window (IST): ${fmtIst(range.start)} → ${fmtIst(range.end)}`, margin, 54);
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, margin, 66);
  doc.text(
    `Rows: ${rows.length} · Working hours (credit): ${totalCredit} · Active minutes (sum): ${totalActive} · Working buckets: ${workingRows}`,
    margin,
    78,
  );
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(
    "Time Doctor + Google Workspace (Gmail, Drive, Chat, Calendar). Words* = estimated from activity signals.",
    margin,
    90,
    { maxWidth: pageW - margin * 2 },
  );
  doc.setTextColor(20);

  autoTable(doc, {
    startY: 100,
    margin: { left: margin, right: margin },
    head: [[
      "Day",
      "Hour",
      "TD min",
      "Active",
      "Inactive",
      "Meetings",
      "Chat",
      "Emails",
      "Docs",
      "Words*",
      "Working",
      "Credit",
    ]],
    body: rows.map((r) => [
      r.day,
      String(r.hour),
      String(r.timeDoctorMinutes),
      String(r.activeMinutes),
      String(r.inactiveMinutes),
      String(r.meetingsAttended),
      String(r.chatMessages),
      String(r.emails),
      String(r.docsCreated),
      r.wordsTypedOrSpoken ? String(r.wordsTypedOrSpoken) : "—",
      r.working,
      String(r.hoursCredit),
    ]),
    styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { halign: "right", cellWidth: 28 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "center", cellWidth: 36 },
      11: { halign: "right", cellWidth: 32 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 10) return;
      const row = rows[data.row.index];
      if (!row) return;
      if (row.working === "Yes") {
        data.cell.styles.textColor = [5, 120, 80];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
}

/** Server-safe PDF bytes for email attachments. */
export function buildHourlyActivityPdfBuffer(args: HourlyPdfMeta): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  renderHourlyActivityPdf(doc, args);
  return Buffer.from(doc.output("arraybuffer"));
}

export function downloadHourlyActivityPdf(args: HourlyPdfMeta) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  renderHourlyActivityPdf(doc, args);
  const slug = args.userEmail.split("@")[0] || "employee";
  const day = args.range.start.slice(0, 10);
  doc.save(`hourly-activity-${slug}-${day}.pdf`);
}
