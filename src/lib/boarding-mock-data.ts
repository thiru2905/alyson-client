import type { EmployeeFull } from "@/lib/queries";
import type { BoardingFlow, PdfTable } from "@/lib/boarding-pdf-schema";

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

function titleCaseEmailFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(".");
  return `${slug || "user"}@example.com`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function yesNo(i: number): "Yes" | "No" {
  return i % 3 === 0 ? "No" : "Yes";
}

function statusValue(i: number): string {
  return i % 7 === 0 ? "Pending" : i % 5 === 0 ? "Not Applicable" : "Completed";
}

function createdValue(i: number): string {
  return i % 5 === 0 ? "Not Required" : i % 7 === 0 ? "Pending" : "Created";
}

function safeDept(e: EmployeeFull): string {
  return e.department_name && e.department_name !== "—" ? e.department_name : "General";
}

export function buildRowsForPdfTable(args: {
  table: PdfTable;
  flow: BoardingFlow;
  employees: EmployeeFull[];
}): Record<string, unknown>[] {
  const { table, employees } = args;
  const emps = employees.length ? employees : [];

  const baseDate = new Date("2026-01-01T00:00:00.000Z");

  switch (table.id) {
    case "active-list-employees": {
      const rows = (emps.length ? emps : new Array(25).fill(null).map((_, i) => ({
        id: `mock_${i}`,
        full_name: `Employee ${i + 1}`,
        email: titleCaseEmailFromName(`Employee ${i + 1}`),
        role: "Staff",
        level: "1",
        department_id: "d",
        hire_date: formatDate(addDays(baseDate, -120 - i)),
        performance_score: 3.2,
        department_name: "General",
        comp: null,
        total_comp: 0,
        effective_bonus: 0,
      } as unknown as EmployeeFull))).slice(0, 60);

      return rows.map((e, i) => {
        const name = e.full_name;
        const team = safeDept(e);
        return {
          Name: name,
          "Cintara.ai Email": `${name.split(" ")[0]?.toLowerCase() || "user"}@cintara.ai`,
          Location: i % 4 === 0 ? "Pune" : i % 4 === 1 ? "Lahore" : i % 4 === 2 ? "Islamabad" : "Remote",
          "Email ID": e.email || titleCaseEmailFromName(name),
          "Official Email": `${(name.split(" ")[0] || "user").toLowerCase()}@revcloud.com`,
          Team: team,
          "Account Required?": i % 6 === 0 ? "No" : "Yes",
          "Password to use": `Pass@${1000 + i}`,
          Status: i % 10 === 0 ? "Deleted" : "Active",
        };
      });
    }

    case "onboarding-form": {
      const rows = (emps.length ? emps : []).slice(0, 25);
      return rows.map((e, i) => ({
        Timestamp: `${formatDate(addDays(baseDate, i))} 10:${String(10 + (i % 40)).padStart(2, "0")}:00`,
        "Employee Full Name": e.full_name,
        "Date of Joining": formatDate(addDays(baseDate, -7 + i)),
        "Physical Resources and Access [Laptop Given]": statusValue(i),
        "Physical Resources and Access [Access Card Issued]": statusValue(i + 1),
        "Physical Resources and Access [Parking Spot Allocated]": i % 2 === 0 ? "Not Applicable" : statusValue(i + 2),
        "Reporting Manager": pick(rows, i + 3)?.full_name ?? "Manager",
        "Account Provisioning Checklist [Google Account Setup]": createdValue(i),
        "Account Provisioning Checklist [Time Doctor Account Setup]": createdValue(i + 1),
        "Account Provisioning Checklist [MS Team Account Setup]": createdValue(i + 2),
        "Account Provisioning Checklist [Slack Account Setup]": createdValue(i + 3),
        "Account Provisioning Checklist [JIRA Access Granted]": createdValue(i + 4),
        "Account Provisioning Checklist [Confluence Access Granted]": createdValue(i + 5),
        "Account Provisioning Checklist [AWS Access Granted]": i % 3 === 0 ? "Not Required" : createdValue(i + 6),
        "HR and Team Integration [Payroll Setup Completed]": statusValue(i + 2),
        "HR and Team Integration [Buddy Assigned]": yesNo(i),
        "HR and Team Integration [Welcome Call Scheduled/Completed]": i % 4 === 0 ? "Scheduled" : "Completed",
        "Onboarding Coordinator/HR Representative Name": i % 2 === 0 ? "Prashansa" : "Garima",
        "Overall Onboarding Rating (out of 5)": String(4 + (i % 2)),
      }));
    }

    case "onboarding-mastersheet-short": {
      const rows = (emps.length ? emps : []).slice(0, 40);
      return rows.map((e, i) => ({
        "Full Name": e.full_name,
        Department: safeDept(e),
        Designation: e.role || "Analyst",
        "Date of Joining (DOJ)": e.hire_date || formatDate(addDays(baseDate, -30 - i)),
        Sourcer: i % 3 === 0 ? "Owais" : i % 3 === 1 ? "Prashansa" : "Anila",
        Recruiter: i % 4 === 0 ? "Azhar" : i % 4 === 1 ? "Sahil" : i % 4 === 2 ? "Owais" : "Prashansa",
        "Candidate Docs Link": `Candidate Docs — ${e.full_name}`,
        Manager: pick(rows, i + 5)?.full_name ?? "Manager",
        Team: safeDept(e),
        "Active/Inactive": i % 9 === 0 ? "Inactive" : "Active",
        Location: i % 4 === 0 ? "Pune" : "Lahore",
        "Personal Email ID": e.email || titleCaseEmailFromName(e.full_name),
        "Phone Number": `03${String(100000000 + (i * 731) % 900000000).slice(0, 9)}`,
        "Offer Letter Signed?": yesNo(i),
        "Laptop Assigned?": yesNo(i + 1),
        "System Email Created?": yesNo(i + 2),
        "Buddy Assigned": yesNo(i + 3),
        "Orientation Date": formatDate(addDays(baseDate, i)),
        "HR Checklist Complete?": yesNo(i + 4),
        "IT Checklist Complete? (Earpods/Laptop)": yesNo(i + 5),
        Notes: i % 7 === 0 ? "In Process" : "—",
      }));
    }

    case "offboarding-tracker": {
      const rows = (emps.length ? emps : []).slice(0, 20);
      return rows.map((e, i) => ({
        Name: e.full_name,
        Department: safeDept(e),
        Manager: pick(rows, i + 2)?.full_name ?? "Manager",
        "Last Day": i % 6 === 0 ? "Immediate" : formatDate(addDays(baseDate, 14 + i)),
      }));
    }

    case "offboarding-form-responses": {
      const rows = (emps.length ? emps : []).slice(0, 20);
      return rows.map((e, i) => ({
        "Name of Offboarded Employee": e.full_name,
        "Last working day": i % 6 === 0 ? "Immediate" : formatDate(addDays(baseDate, 7 + i)),
        "Knowledge Transfer Completion Status": i % 5 === 0 ? "In Progress" : "Completed",
        "Transfer Employee Drive Data to:": pick(rows, i + 1)?.full_name ?? "Manager",
        "Critical Assets and Access Revoked/Returned Status [Laptop/Computer]": i % 4 === 0 ? "Pending" : "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Mobile Phone/Tablet]": i % 3 === 0 ? "Not Applicable" : "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Office Keys/Access Card]": "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Software Licenses/Accounts]": "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Team Drives/Shared Folder Access]": "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Microsoft Teams]": i % 4 === 0 ? "Pending" : "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Time Doctor]": i % 4 === 1 ? "Pending" : "Returned/Revoked",
        "Critical Assets and Access Revoked/Returned Status [Revcloud Email]": i % 4 === 2 ? "Pending" : "Returned/Revoked",
        "Other Accounts Access That Needs to be Revoked (Please List)": i % 2 === 0 ? "AWS, GitHub, Jira" : "Segment, Confluence",
        "Performance Feedback/Exit Interview Scheduled?": i % 2 === 0 ? "Yes" : "No",
        "Manager's Overall Offboarding Satisfaction": String(4 + (i % 2)),
        "Any further comments or necessary actions?": i % 6 === 0 ? "Follow up on remaining access." : "—",
      }));
    }

    case "offboarding-program": {
      return [
        {
          Stage: "1. Pre-Exit Preparation",
          "Action Item": "Receive official resignation/termination notice (written proof)",
          Owner: "HR",
          "Due Date": "Day 1 of notice",
          Status: "Pending",
        },
        { Stage: "1. Pre-Exit Preparation", "Action Item": "Update HRIS with last working day", Owner: "HR", "Due Date": "Day 1 of notice", Status: "Pending" },
        { Stage: "1. Pre-Exit Preparation", "Action Item": "Align with manager on notice period & transition plan", Owner: "HR + Manager", "Due Date": "Within 2 days", Status: "Pending" },
        { Stage: "2. Knowledge Transfer & Handover", "Action Item": "Prepare detailed handover document", Owner: "Employee", "Due Date": "1 week before last day", Status: "Pending" },
        { Stage: "3. IT & Security Offboarding", "Action Item": "Disable the Microsoft Teams Account", Owner: "IT", "Due Date": "Last day", Status: "Pending" },
        { Stage: "4. HR & Payroll Finalization", "Action Item": "Calculate & process final salary", Owner: "Payroll", "Due Date": "Within 3 days post-exit", Status: "Pending" },
        { Stage: "5. Exit Interview", "Action Item": "Conduct interview & collect feedback", Owner: "HR", "Due Date": "Before last day", Status: "Pending" },
        { Stage: "6. Post-Exit Follow-up", "Action Item": "Update references & alumni database", Owner: "HR", "Due Date": "Within 1 week post-exit", Status: "Pending" },
      ];
    }

    case "buddy-manager-allotment": {
      const rows = (emps.length ? emps : []).slice(0, 6);
      return rows.flatMap((e, i) => {
        const manager = pick(rows, i + 1)?.full_name ?? "Manager";
        const buddy = pick(rows, i + 2)?.full_name ?? "Buddy";
        const location = i % 2 === 0 ? "Lahore Office" : "Pune Office";
        return [
          { Section: "👤 New Joiner", Details: `Name: ${e.full_name}\nRole: ${e.role}\nDepartment: ${safeDept(e)}\nJoining Date: ${e.hire_date || formatDate(addDays(baseDate, i))}` },
          { Section: "🧑‍💼 Manager", Details: `Name: ${manager}\nEmail: ${titleCaseEmailFromName(manager)}` },
          { Section: "🤝 Assigned Buddy", Details: `Name: ${buddy}\nEmail: ${titleCaseEmailFromName(buddy)}` },
          { Section: "📌 Points of Contact (POCs)", Details: "HR: prashansa@revcloud.com\nIT: zaman@revcloud.com" },
          { Section: "📍 Location", Details: location },
          { Section: "📝 Notes", Details: i % 2 === 0 ? "Laptop and email ready." : "Buddy intro scheduled." },
        ];
      });
    }

    case "30-60-90": {
      const rows = (emps.length ? emps : []).slice(0, 10);
      const checklistCols = table.columns.filter((c) => c !== "Full Name" && c !== "Notes");
      return rows.map((e, i) => {
        const r: Record<string, unknown> = { "Full Name": e.full_name, Notes: i % 3 === 0 ? "On track" : "—" };
        // Populate a few early columns with real-ish values
        r["Department"] = safeDept(e);
        r["Designation"] = e.role;
        r["Date of Joining (DOJ)"] = e.hire_date || formatDate(addDays(baseDate, -90 + i));
        r["Manager"] = pick(rows, i + 1)?.full_name ?? "Manager";
        r["Team"] = safeDept(e);
        r["Location"] = i % 2 === 0 ? "Lahore" : "Pune";
        r["Email ID"] = e.email || titleCaseEmailFromName(e.full_name);
        r["Offer Letter Signed"] = "Yes";
        r["Laptop provided"] = i % 4 === 0 ? "No" : "Yes";
        r["System Access Provided"] = i % 5 === 0 ? "In Progress" : "Yes";
        // Fill the rest with sparse dummy statuses so it looks populated but not noisy
        for (const c of checklistCols) {
          if (r[c] != null) continue;
          r[c] = i % 6 === 0 ? "In Progress" : i % 9 === 0 ? "No" : "Yes";
        }
        return r;
      });
    }

    default: {
      // Generic fill to avoid empty tables if new tabs are added.
      const cols = table.columns;
      return new Array(15).fill(null).map((_, i) => {
        const out: Record<string, unknown> = {};
        cols.forEach((c) => (out[c] = `${c} ${i + 1}`));
        return out;
      });
    }
  }
}

export function defaultTabForFlow(flow: BoardingFlow, tables: PdfTable[]): string {
  const first = tables.find((t) => t.flow === "both" || t.flow === flow);
  return first?.id ?? tables[0]?.id ?? "onboarding-form";
}

