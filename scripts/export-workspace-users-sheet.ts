/**
 * Export Google Workspace users to Excel with pacing-style Active column.
 *
 * Usage:
 *   dotenv -e .env -- npx tsx scripts/export-workspace-users-sheet.ts
 *   dotenv -e .env -- npx tsx scripts/export-workspace-users-sheet.ts --active-only
 *   dotenv -e .env -- npx tsx scripts/export-workspace-users-sheet.ts --no-activity
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import {
  buildCintaraActiveMemberLookup,
  parseCintaraDomainCsv,
  resolveCintaraActiveForPacing,
} from "@/lib/cintara-active-members";
import {
  attachManagerToPacingRow,
  buildOrgChartRosterLookup,
  mergeOrgChartRosterEntries,
  parseOrgChartRosterCsv,
} from "@/lib/org-chart-roster";
import { parseOnboardingCsv } from "@/lib/onboarding-csv";
import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { formatActiveLabel } from "@/lib/weekly-pacing";
import {
  findWeeklyPacingActiveOverride,
  readWeeklyPacingActiveOverridesFromS3,
} from "@/lib/weekly-pacing-active-s3.server";
import { listTimeDoctorUsersLight } from "@/lib/time-doctor-functions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "exports");
const rosterPath = join(root, "src/data/org-chart-roster.csv");
const onboardingPath = join(root, "src/data/onboarding-roster.csv");
const domainCsvPath = join(root, "src/data/cintara-domain-emails.csv");

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";

type WorkspaceUserRow = {
  Name: string;
  Email: string;
  "Workspace Status": string;
  "Last Sign In": string;
  Active: "Yes" | "No";
  "Active Source": string;
  "In Time Doctor": "Yes" | "No";
  "Emails Sent (7d)": number;
  "Meetings (7d)": number;
  "Docs Created (7d)": number;
  "Chat Messages (7d)": number;
  "Has Workspace Activity (7d)": "Yes" | "No";
  Team: string;
  Location: string;
  Manager: string;
  "Org Unit": string;
  "Account Created": string;
};

function env(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function loadServiceAccountJwtForSubject(subject: string, scopes: string[]) {
  let parsed: { client_email?: string; private_key?: string } | null = null;
  const inlineJson = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    parsed = JSON.parse(inlineJson) as { client_email?: string; private_key?: string };
  } else {
    const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
    const txt = await fs.readFile(credentialsPath, "utf8");
    parsed = JSON.parse(txt) as { client_email?: string; private_key?: string };
  }
  const clientEmail = parsed.client_email || env("GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL");
  const privateKey = parsed.private_key;
  if (!privateKey) throw new Error("Missing service account private_key");
  return new JWT({ email: clientEmail, key: privateKey, scopes, subject });
}

function formatGoogleTime(iso: string | null | undefined): string {
  const raw = String(iso || "").trim();
  if (!raw || raw.startsWith("1970-01-01")) return "Never";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

function workspaceStatus(u: { suspended?: boolean | null; archived?: boolean | null }): string {
  if (u.archived) return "Archived";
  if (u.suspended) return "Suspended";
  return "Active";
}

/** Same listing as Workspace Activity (`listAllUsers` in workspace-activity.server.ts). */
async function listGoogleWorkspaceUsers(mode: "all" | "active-only") {
  const adminSubject = env("GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
  const auth = await loadServiceAccountJwtForSubject(adminSubject, [DIRECTORY_SCOPE]);
  const directory = google.admin({ version: "directory_v1", auth });
  const out: Array<{
    email: string;
    name: string;
    suspended: boolean;
    archived: boolean;
    lastLoginTime: string;
    creationTime: string;
    orgUnitPath: string;
  }> = [];
  let pageToken: string | undefined;

  do {
    const resp = await directory.users.list({
      customer: "my_customer",
      maxResults: 500,
      orderBy: "email",
      pageToken,
      projection: "full",
      ...(mode === "active-only" ? { query: "isSuspended=false" } : {}),
    });
    for (const u of resp.data.users ?? []) {
      const email = String(u.primaryEmail || "").trim().toLowerCase();
      if (!email) continue;
      const suspended = Boolean(u.suspended);
      const archived = Boolean(u.archived);
      if (mode === "active-only" && (suspended || archived)) continue;
      const name =
        u.name?.fullName?.trim() ||
        [u.name?.givenName, u.name?.familyName].filter(Boolean).join(" ").trim() ||
        email.split("@")[0] ||
        email;
      out.push({
        email,
        name,
        suspended,
        archived,
        lastLoginTime: String(u.lastLoginTime || ""),
        creationTime: String(u.creationTime || ""),
        orgUnitPath: String(u.orgUnitPath || "/"),
      });
    }
    pageToken = resp.data.nextPageToken || undefined;
  } while (pageToken);

  return out;
}

async function loadWorkspaceActivity7d(mode: "gmail-only" | "full") {
  if (mode === "gmail-only") {
    const { getWorkspaceGmailSentCounts } = await import("@/lib/workspace-activity.server");
    const { counts, warnings } = await getWorkspaceGmailSentCounts();
    const byEmail = new Map(
      [...counts.entries()].map(([email, emailsSent]) => [
        email,
        { emailsSent, meetingsCreated: 0, docsCreated: 0, chatMessagesSent: 0 },
      ]),
    );
    return { byEmail, warnings };
  }

  process.env.WORKSPACE_ACTIVITY_TIMEOUT_MS = process.env.WORKSPACE_ACTIVITY_TIMEOUT_MS || "180000";
  const { runGetWorkspaceActivity } = await import("@/lib/workspace-activity.server");
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const data = await runGetWorkspaceActivity({
    start: start.toISOString(),
    end: end.toISOString(),
    accurateMeetings: false,
  });
  const byEmail = new Map(
    data.rows.map((r) => [
      r.userEmail.toLowerCase(),
      {
        emailsSent: r.emailsSent,
        meetingsCreated: r.meetingsCreated,
        docsCreated: r.docsCreated,
        chatMessagesSent: r.chatMessagesSent,
      },
    ]),
  );
  return { byEmail, warnings: data.warnings };
}

function loadPacingLookups() {
  const orgChart = parseOrgChartRosterCsv(readFileSync(rosterPath, "utf8"));
  const onboardingRows = parseOnboardingCsv(readFileSync(onboardingPath, "utf8")).flatMap((row) => {
    const email = canonicalOfficialEmail(String(row["Official Email"] ?? ""));
    if (!email) return [];
    return [
      {
        name: String(row.Name ?? "").trim() || email.split("@")[0] || email,
        email,
        personalEmail: String(row["Personal Email"] ?? "").trim() || undefined,
        location: String(row.Location ?? "").trim(),
        team: String(row.Team ?? "").trim(),
        managerLabel: String(row.Manager ?? "").trim(),
      },
    ];
  });
  const rosterLookup = buildOrgChartRosterLookup(mergeOrgChartRosterEntries(orgChart, onboardingRows));
  const activeLookup = buildCintaraActiveMemberLookup(
    parseCintaraDomainCsv(readFileSync(domainCsvPath, "utf8")),
  );
  return { rosterLookup, activeLookup };
}

function resolvePacingActive(
  overrides: Awaited<ReturnType<typeof readWeeklyPacingActiveOverridesFromS3>>,
  activeLookup: ReturnType<typeof buildCintaraActiveMemberLookup>,
  rosterLookup: ReturnType<typeof buildOrgChartRosterLookup>,
  args: { employeeId: string; email: string; name: string },
) {
  const computedActive = resolveCintaraActiveForPacing(activeLookup, rosterLookup, {
    email: args.email,
    name: args.name,
  });
  const override = findWeeklyPacingActiveOverride(overrides, {
    employeeId: args.employeeId,
    email: args.email,
  });
  if (!override) {
    return { active: computedActive, activeOverridden: false };
  }
  return { active: override.active, activeOverridden: true };
}

async function main() {
  const activeOnly = process.argv.includes("--active-only");
  const skipActivity = process.argv.includes("--no-activity");
  const fullActivity = process.argv.includes("--full-activity");
  const userMode = activeOnly ? "active-only" : "all";
  console.log(
    `Fetching Google Workspace users (${userMode === "all" ? "all — matches Workspace Activity module" : "active only"})…`,
  );

  const [workspaceUsers, tdUsers, activeOverrides, activity] = await Promise.all([
    listGoogleWorkspaceUsers(userMode),
    listTimeDoctorUsersLight().catch((e) => {
      console.warn("Time Doctor users unavailable:", e instanceof Error ? e.message : e);
      return [] as Array<{ id: string; name: string; email: string }>;
    }),
    readWeeklyPacingActiveOverridesFromS3().catch((e) => {
      console.warn("Pacing active overrides unavailable:", e instanceof Error ? e.message : e);
      return { version: 1 as const, updatedAt: "", byEmployeeId: {} };
    }),
    skipActivity
      ? Promise.resolve({ byEmail: new Map<string, never>(), warnings: [] as string[] })
      : loadWorkspaceActivity7d(fullActivity ? "full" : "gmail-only").catch((e) => {
          console.warn("Workspace activity unavailable:", e instanceof Error ? e.message : e);
          return { byEmail: new Map<string, never>(), warnings: [] as string[] };
        }),
  ]);

  if (activity.warnings.length) {
    console.warn("Workspace activity warnings:", activity.warnings.slice(0, 3).join(" | "));
  }

  const { rosterLookup, activeLookup } = loadPacingLookups();
  const tdByEmail = new Map(tdUsers.map((u) => [u.email.toLowerCase(), u]));

  const rows: WorkspaceUserRow[] = workspaceUsers
    .map((u) => {
      const td = tdByEmail.get(u.email);
      const meta = attachManagerToPacingRow({ email: u.email, name: u.name }, rosterLookup);
      const resolved = resolvePacingActive(activeOverrides, activeLookup, rosterLookup, {
        employeeId: td?.id ?? "",
        email: u.email,
        name: u.name,
      });

      let activeSource = "Computed";
      if (resolved.activeOverridden) activeSource = "Manual override (S3)";
      else if (!td) activeSource = "Computed (not in Time Doctor)";

      const act = activity.byEmail.get(u.email);
      const emailsSent = act?.emailsSent ?? 0;
      const meetings = act?.meetingsCreated ?? 0;
      const docs = act?.docsCreated ?? 0;
      const chat = act?.chatMessagesSent ?? 0;
      const hasActivity = emailsSent + meetings + docs + chat > 0;

      return {
        Name: u.name,
        Email: u.email,
        "Workspace Status": workspaceStatus(u),
        "Last Sign In": formatGoogleTime(u.lastLoginTime),
        Active: formatActiveLabel(resolved.active),
        "Active Source": activeSource,
        "In Time Doctor": td ? "Yes" : "No",
        "Emails Sent (7d)": emailsSent,
        "Meetings (7d)": meetings,
        "Docs Created (7d)": docs,
        "Chat Messages (7d)": chat,
        "Has Workspace Activity (7d)": hasActivity ? "Yes" : "No",
        Team: meta.team || "",
        Location: meta.location || "",
        Manager: meta.managerName || "",
        "Org Unit": u.orgUnitPath,
        "Account Created": formatGoogleTime(u.creationTime),
      };
    })
    .sort((a, b) => a.Name.localeCompare(b.Name, undefined, { sensitivity: "base" }));

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const timeSuffix = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const base = `google-workspace-users-${stamp}-${timeSuffix}`;
  const xlsxPath = join(outDir, `${base}.xlsx`);
  const csvPath = join(outDir, `${base}.csv`);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Workspace Users");
  XLSX.writeFile(wb, xlsxPath);
  XLSX.writeFile(wb, csvPath, { bookType: "csv" });

  const activeCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.Active] = (acc[r.Active] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Wrote ${xlsxPath}`);
  console.log(`Wrote ${csvPath}`);
  console.log(`rows=${rows.length}`);
  console.log("Pacing Active breakdown:", activeCounts);
  console.log(`In Time Doctor: ${rows.filter((r) => r["In Time Doctor"] === "Yes").length}`);
  if (!skipActivity) {
    const withEmails = rows.filter((r) => r["Emails Sent (7d)"] > 0).length;
    const totalEmails = rows.reduce((n, r) => n + r["Emails Sent (7d)"], 0);
    console.log(`Users with emails sent (7d): ${withEmails}, total emails: ${totalEmails}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
