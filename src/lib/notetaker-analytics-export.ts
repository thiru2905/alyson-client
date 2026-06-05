import type { NotetakerAnalyticsReport } from "@/lib/notetaker-analytics.server";

export function buildMeetingTranscriptUrl(
  origin: string,
  meeting: { day: string; transcriptKey: string },
): string {
  const base = origin.replace(/\/$/, "");
  const params = new URLSearchParams({
    day: meeting.day,
    transcriptKey: meeting.transcriptKey,
    open: "transcript",
  });
  return `${base}/alyson-notetaker/calendar?${params.toString()}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPeriodLabel(report: NotetakerAnalyticsReport, periodLabel?: string) {
  if (periodLabel?.trim()) return periodLabel.trim();
  return `${report.range.start} → ${report.range.end}`;
}

const TALK_TIME_COLORS = ["#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed", "#64748b"];

export type TalkTimeSlice = {
  name: string;
  words: number;
  percent: number;
  color: string;
};

/** Word-share across all analyzed meetings (proxy for talk time). */
export function buildTalkTimeShareSlices(report: NotetakerAnalyticsReport): TalkTimeSlice[] {
  const top = report.topSpeakers.slice(0, 6);
  const totalWords = report.totalWords;
  if (totalWords <= 0) return [];

  const topWords = top.reduce((n, s) => n + s.words, 0);
  const restWords = Math.max(0, totalWords - topWords);

  const slices: TalkTimeSlice[] = top.map((s, i) => ({
    name: s.speaker,
    words: s.words,
    percent: (s.words / totalWords) * 100,
    color: TALK_TIME_COLORS[i % TALK_TIME_COLORS.length]!,
  }));

  if (restWords > 0) {
    slices.push({
      name: "Others",
      words: restWords,
      percent: (restWords / totalWords) * 100,
      color: TALK_TIME_COLORS[6]!,
    });
  }

  return slices.filter((s) => s.words > 0);
}

function conicGradientFromSlices(slices: TalkTimeSlice[]) {
  let acc = 0;
  const stops = slices.map((s) => {
    const start = acc;
    acc += s.percent;
    return `${s.color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
  });
  return stops.length ? `conic-gradient(${stops.join(", ")})` : "#e5e7eb";
}

function formatMeetingSpeakerShare(
  speakers: Array<{ speaker: string; words: number }>,
) {
  const total = speakers.reduce((n, s) => n + s.words, 0);
  if (total <= 0) return "—";
  return speakers
    .slice(0, 8)
    .map((s) => {
      const pct = ((s.words / total) * 100).toFixed(1);
      return `${escapeHtml(s.speaker)} ${pct}%`;
    })
    .join(" · ");
}

export function buildAnalyticsExportHtml(args: {
  report: NotetakerAnalyticsReport;
  origin: string;
  periodLabel?: string;
  insightsMd?: string | null;
}) {
  const { report, origin, insightsMd } = args;
  const period = formatPeriodLabel(report, args.periodLabel);
  const generated = new Date(report.generatedAt).toLocaleString();
  const filterBits: string[] = [];
  filterBits.push(
    report.filters.speakers.length
      ? `Speakers: ${report.filters.speakers.join(", ")}`
      : "Speakers: All",
  );
  const meetingPrefixes = report.filters.meetingPrefixes ?? [];
  if (meetingPrefixes.length > 0) {
    const titles = report.meetings.map((m) => m.title);
    const preview = titles.slice(0, 4).join("; ");
    filterBits.push(
      `Meetings (${titles.length}): ${preview}${titles.length > 4 ? "…" : ""}`,
    );
  } else if (report.filters.meetingTitle) {
    filterBits.push(`Title contains: ${report.filters.meetingTitle}`);
  } else {
    filterBits.push("Meetings: All");
  }

  const talkTimeSlices = buildTalkTimeShareSlices(report);
  const talkTimeRows = talkTimeSlices
    .map(
      (s) =>
        `<tr>
          <td><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</td>
          <td class="num">${s.percent.toFixed(1)}%</td>
          <td class="num">${s.words.toLocaleString()}</td>
          <td><div class="bar-track"><div class="bar-fill" style="width:${s.percent.toFixed(1)}%;background:${s.color}"></div></div></td>
        </tr>`,
    )
    .join("\n");

  const pieGradient = conicGradientFromSlices(talkTimeSlices);
  const pieLegend = talkTimeSlices
    .map(
      (s) =>
        `<li><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.name)} <strong>${s.percent.toFixed(1)}%</strong></li>`,
    )
    .join("\n");

  const meetingRows = report.meetings
    .map((m) => {
      const url = buildMeetingTranscriptUrl(origin, { day: m.day, transcriptKey: m.transcriptKey });
      const who = formatMeetingSpeakerShare(m.speakers);
      return `<tr>
        <td>${escapeHtml(m.day)}</td>
        <td><a href="${escapeHtml(url)}">${escapeHtml(m.title)}</a></td>
        <td class="num">${m.uniqueSpeakers}</td>
        <td class="num">${m.totalUtterances}</td>
        <td class="num">${m.totalWords}</td>
        <td>${who}${m.speakers.length > 8 ? " …" : ""}</td>
      </tr>`;
    })
    .join("\n");

  const topSpeakerRows = report.topSpeakers
    .slice(0, 25)
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.speaker)}</td><td class="num">${s.utterances}</td><td class="num">${s.words}</td><td class="num">${s.meetingsSpoken}</td></tr>`,
    )
    .join("\n");

  const dayRows = report.meetingsByDay
    .map((d) => `<tr><td>${escapeHtml(d.day)}</td><td class="num">${d.meetings}</td></tr>`)
    .join("\n");

  const insightsBlock = insightsMd?.trim()
    ? `<section class="block">
        <h2>AI insights</h2>
        <pre class="insights">${escapeHtml(insightsMd.trim())}</pre>
      </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Meeting analytics — ${escapeHtml(period)}</title>
  <style>
    :root { --text: #111; --muted: #555; --border: #ddd; --link: #0b57d0; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: var(--text); margin: 0; padding: 24px 28px 48px; line-height: 1.45; font-size: 13px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 24px; }
    .kpi { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
    .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .kpi .value { font-size: 20px; font-weight: 600; margin-top: 4px; }
    .block { margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid var(--border); padding: 7px 9px; text-align: left; vertical-align: top; }
    th { background: #f6f6f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    a { color: var(--link); text-decoration: underline; }
    .insights { white-space: pre-wrap; background: #f8f8f8; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 12px; margin: 0; }
    .note { font-size: 11px; color: var(--muted); margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border); }
    .talk-time-wrap { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; }
    .pie-box { position: relative; width: 200px; height: 200px; flex-shrink: 0; }
    .pie {
      width: 100%; height: 100%; border-radius: 50%;
      background: ${pieGradient};
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
    }
    .pie-donut-hole {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: 46%; height: 46%; border-radius: 50%; background: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: var(--muted); text-align: center; line-height: 1.3;
    }
    .pie-legend { list-style: none; margin: 0; padding: 0; font-size: 12px; flex: 1; min-width: 200px; }
    .pie-legend li { margin: 6px 0; display: flex; align-items: center; gap: 8px; }
    .pie-legend strong { margin-left: auto; font-variant-numeric: tabular-nums; }
    .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
    .bar-track { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; min-width: 120px; }
    .bar-fill { height: 100%; border-radius: 4px; }
    @media print {
      body { padding: 12px; }
      a { color: var(--link); }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <p class="no-print meta"><strong>Tip:</strong> Use your browser <em>Print → Save as PDF</em> to get a PDF; meeting links stay clickable in the HTML file and in most PDF exports from Chrome/Edge.</p>
  <h1>Meeting analytics report</h1>
  <p class="meta">
    Period: <strong>${escapeHtml(period)}</strong><br />
    Generated: ${escapeHtml(generated)}<br />
    ${filterBits.length ? escapeHtml(filterBits.join(" · ")) : "No speaker/title filters"}
  </p>

  <div class="kpis">
    <div class="kpi"><div class="label">Meetings in range</div><div class="value">${report.meetingCount}</div></div>
    <div class="kpi"><div class="label">Analyzed</div><div class="value">${report.analyzedCount}</div></div>
    <div class="kpi"><div class="label">Unique speakers</div><div class="value">${report.uniqueSpeakersGlobal}</div></div>
    <div class="kpi"><div class="label">Total utterances</div><div class="value">${report.totalUtterances}</div></div>
  </div>

  ${insightsBlock}

  <section class="block">
    <h2>Talk-time share (% of words spoken)</h2>
    <p class="meta" style="margin-top:0">Share of total words across all analyzed meetings in this period (proxy for airtime; transcripts have no per-segment duration).</p>
    ${
      talkTimeSlices.length
        ? `<div class="talk-time-wrap">
      <div class="pie-box">
        <div class="pie" role="img" aria-label="Talk-time pie chart"></div>
        <div class="pie-donut-hole">${report.totalWords.toLocaleString()}<br />words</div>
      </div>
      <ul class="pie-legend">${pieLegend}</ul>
    </div>
    <table style="margin-top:16px">
      <thead><tr><th>Speaker</th><th class="num">Talk time</th><th class="num">Words</th><th>Share</th></tr></thead>
      <tbody>${talkTimeRows}</tbody>
    </table>`
        : "<p>—</p>"
    }
  </section>

  <section class="block">
    <h2>Top speakers</h2>
    <table>
      <thead><tr><th>Speaker</th><th class="num">Utterances</th><th class="num">Words</th><th class="num">Meetings</th></tr></thead>
      <tbody>${topSpeakerRows || "<tr><td colspan=\"4\">—</td></tr>"}</tbody>
    </table>
  </section>

  <section class="block">
    <h2>Meetings by day</h2>
    <table>
      <thead><tr><th>Day</th><th class="num">Meetings</th></tr></thead>
      <tbody>${dayRows || "<tr><td colspan=\"2\">—</td></tr>"}</tbody>
    </table>
  </section>

  <section class="block">
    <h2>Meetings (click title to open transcript)</h2>
    <table>
      <thead>
        <tr>
          <th>Day</th>
          <th>Meeting</th>
          <th class="num">Speakers</th>
          <th class="num">Utterances</th>
          <th class="num">Words</th>
          <th>Talk-time by speaker (within meeting)</th>
        </tr>
      </thead>
      <tbody>${meetingRows || "<tr><td colspan=\"6\">No meetings in this report.</td></tr>"}</tbody>
    </table>
  </section>

  <p class="note">
  Exported from Alyson Notetaker analytics. Transcript links open Meeting Calendar with the transcript panel.
  Base URL: ${escapeHtml(origin)}
  </p>
</body>
</html>`;
}

export function downloadAnalyticsHtml(html: string, filenameBase: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

const PRINT_SCRIPT = `<script>
(function () {
  function runPrint() {
    try { window.focus(); window.print(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(runPrint, 500);
  else window.addEventListener("load", function () { setTimeout(runPrint, 500); });
})();
</script>`;

/** Opens HTML in a new tab and triggers print (fallback if direct PDF fails). */
export function printAnalyticsExport(html: string) {
  const docHtml = html.includes("</body>")
    ? html.replace("</body>", `${PRINT_SCRIPT}</body>`)
    : `${html}${PRINT_SCRIPT}`;

  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups for this site, or use Export HTML.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function analyticsExportFilename(report: NotetakerAnalyticsReport) {
  return `meeting-analytics_${report.range.start}_${report.range.end}`;
}
