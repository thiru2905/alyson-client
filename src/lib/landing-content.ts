export type FaqItem = { q: string; a: string };

export const LANDING_FAQ: FaqItem[] = [
  {
    q: "How do I get started?",
    a: "Click Open workspace on the home page, sign in with Clerk, and you land in /app. Use the sidebar to open any module your role can access.",
  },
  {
    q: "What modules are included?",
    a: "Team, Time Dashboard, payroll, bonus, equity, leave, attendance, performance, Notetaker, Meeting Hours, workflows, documents, Alyson Brain, and more. See the Modules page for a full guide.",
  },
  {
    q: "What is super-admin access?",
    a: "Sensitive modules (payroll, leave, Meeting Hours, bonus approvals, and similar) require super-admin RBAC. Demo workspaces include a role switcher so you can preview CEO, HR, manager, and employee views.",
  },
  {
    q: "How is Alyson different from chat-only AI?",
    a: "Alyson reads live module data (time pacing, payroll runs, meeting transcripts) with source lineage. It can draft reports, send scheduled emails, and surface changes on dashboards, not just answer questions in a chat box.",
  },
  {
    q: "Who can see my team's data?",
    a: "Access is role-based. Managers see their reporting lines; HR and finance see comp and people modules per policy; employees see their own records. Super-admins configure gates for the most sensitive boards.",
  },
  {
    q: "Does Alyson integrate with our calendar and time tools?",
    a: "Yes. Calendar, Time Doctor pacing, workspace activity, and roster data feed Time Dashboard, Meeting Hours, and Notetaker analytics. Integrations vary by deployment. Contact us for your stack.",
  },
  {
    q: "Can I export reports?",
    a: "Most analytics and HR modules support CSV export. Meeting Hours can be emailed on a schedule. Payroll and bonus boards keep audit trails for finance review.",
  },
  {
    q: "Is there a mobile experience?",
    a: "The workspace is responsive. Managers commonly review pacing and approvals on tablet; deep payroll editing is best on desktop.",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  title: string;
  handle: string;
};

export const LANDING_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Stopped chasing timesheets every Friday. Time Dashboard pacing flags slips before my 1:1s.",
    name: "Priya Sharma",
    title: "Head of Ops · Remote-first",
    handle: "priya_ops",
  },
  {
    quote:
      "Meeting Hours report lands in my inbox Monday. I forward it to leadership without touching Excel.",
    name: "Sarah Kim",
    title: "Chief of Staff",
    handle: "sarah_cos",
  },
  {
    quote:
      "Performance review season used to mean 40 hours of doc wrangling. Agent drafts got us 70% there.",
    name: "Elena Ruiz",
    title: "HR Ops Lead",
    handle: "elena_hrops",
  },
  {
    quote: "Payroll + bonus + equity behind one RBAC gate is exactly how finance wanted it.",
    name: "James Okonkwo",
    title: "FP&A Director",
    handle: "jokonkwo_fpa",
  },
  {
    quote:
      "Notetaker + Meeting Hours finally answer 'are we in too many meetings?' with actual hours, not vibes.",
    name: "Omar Hassan",
    title: "Engineering Manager",
    handle: "omar_engmgr",
  },
  {
    quote:
      "The org chart isn't a PDF anymore. It's where approvals and reporting lines actually connect.",
    name: "Marcus Chen",
    title: "Finance Lead",
    handle: "marcus_fp",
  },
  {
    quote: "I ask Alyson Brain why payroll moved and it cites the tables. That's trust.",
    name: "Anita Verma",
    title: "Controller",
    handle: "anita_ctrl",
  },
  {
    quote:
      "Clean UI, same inside the app as the marketing site. Exec team didn't think it was 'another HR portal'.",
    name: "David Park",
    title: "CEO",
    handle: "davidparkceo",
  },
];

export const FEATURE_GUIDE = [
  {
    title: "Time tracking",
    body: "Time Doctor pacing, hourly activity, and manager-scoped dashboards. See who is ahead or behind for the week without exporting spreadsheets.",
  },
  {
    title: "Performance",
    body: "Reviews, goals, and employee scoring with draft summaries grounded in workspace activity and module history.",
  },
  {
    title: "Analytics",
    body: "Cross-module insights for people, pay, and meetings. Compare teams, spot trends, and drill into the underlying records.",
  },
  {
    title: "Workflow automation",
    body: "Approvals, onboarding checklists, leave routing, and reminders. Each step respects role-based access.",
  },
  {
    title: "Integrations",
    body: "Calendar, workspace mail, Time Doctor, roster directories, and SES for scheduled reports like Meeting Hours.",
  },
  {
    title: "Meeting intelligence",
    body: "Notetaker transcripts, Meeting Hours rollups, bot join reporting, and calendar views, all tied to real attendees.",
  },
] as const;

export const HOW_IT_WORKS_STEPS = [
  {
    title: "Connect your tools",
    body: "Calendar, Time Doctor, Google Workspace roster, and payroll sources sync into one Alyson workspace. Data lands in the modules your team already uses.",
  },
  {
    title: "Alyson tracks & analyzes",
    body: "Pacing, meetings, comp changes, and approvals stay linked to people and teams. Alyson Brain can explain movements with citations back to module tables.",
  },
  {
    title: "Real-time insights",
    body: "Dashboards and module views update as data changes. Managers see their scope; HR and finance see governed boards behind RBAC.",
  },
  {
    title: "Reports auto-generate",
    body: "Meeting Hours emails, review drafts, workflow nudges, and exports run on schedules or on demand, always permission checked.",
  },
] as const;

export type ModuleGuide = {
  name: string;
  group: "Workspace" | "People" | "Money" | "Ops";
  summary: string;
};

export const MODULE_GUIDE: ModuleGuide[] = [
  { group: "Workspace", name: "Alyson Brain", summary: "Ask questions across HR data with answers tied to live module records." },
  { group: "Workspace", name: "Dashboard", summary: "Executive snapshot of headcount, payroll, meetings, and open items." },
  { group: "People", name: "Team", summary: "Org chart, reporting lines, and people directory in one view." },
  { group: "People", name: "Employee Onboarding", summary: "Offer-to-day-one checklists with owners and status tracking." },
  { group: "People", name: "Time Dashboard", summary: "Weekly pacing vs targets from Time Doctor with manager filters." },
  { group: "People", name: "Performance", summary: "Review cycles, goals, and pacing toward completion." },
  { group: "People", name: "Leave", summary: "Requests, balances, calendar overlays, and approval flows." },
  { group: "People", name: "Attendance", summary: "Daily hours and adjustments with audit-friendly rows." },
  { group: "Money", name: "Payroll", summary: "Pay runs, taxes, and net totals with finance-grade boards." },
  { group: "Money", name: "Bonus", summary: "Plans, eligibility, simulations, and approval workflows." },
  { group: "Money", name: "Equity", summary: "Grants, vesting schedules, and cap-table style views." },
  { group: "Ops", name: "Workflows", summary: "Multi-step approvals for HR, finance, and managers." },
  { group: "Ops", name: "Documents", summary: "Templates and signed packs with version history." },
  { group: "Ops", name: "Handover Docs", summary: "Role transitions with access transfer and runbook links." },
  { group: "Ops", name: "Workspace Activity", summary: "Mail and workspace signals rolled up per person." },
  { group: "Ops", name: "Employee Scoring", summary: "Composite scores with drill-down to contributing signals." },
  { group: "Ops", name: "Reports", summary: "Scheduled and ad-hoc exports across people and pay." },
  { group: "Ops", name: "Alyson Notetaker", summary: "Meeting bots, transcripts, and generated notes." },
  { group: "Ops", name: "Meeting Hours", summary: "Per-person meeting load with compare and email reports." },
  { group: "Ops", name: "Meeting List", summary: "Searchable log of meetings with duration and attendees." },
  { group: "Ops", name: "Meeting Calendar", summary: "Calendar heatmap of meeting density by day." },
  { group: "Ops", name: "Analytics", summary: "Unified meeting and cost analytics across sources." },
  { group: "Ops", name: "Bot Join Report", summary: "Which meetings the notetaker joined or missed." },
  { group: "Ops", name: "Unified Meetings", summary: "Single pane for cross-platform meeting records." },
  { group: "Ops", name: "Tasks", summary: "Action items from meetings and workflows in one queue." },
];

export const CAREERS_OPENINGS = [
  {
    title: "Senior Full-Stack Engineer",
    location: "Newport Beach, CA · Hybrid",
    team: "Product",
    blurb: "Ship HR modules end to end with TanStack, React, and server functions on real customer data.",
  },
  {
    title: "HR Operations Lead",
    location: "Remote · US",
    team: "Customer",
    blurb: "Help operators configure Alyson for pacing, payroll, and meeting intelligence rollouts.",
  },
  {
    title: "Design Engineer",
    location: "Newport Beach, CA · Hybrid",
    team: "Design",
    blurb: "Own the calm, editorial UI system: dashboards, reports, and onboarding flows.",
  },
] as const;

export const CONTACT = {
  email: "hello@cintara.ai",
  careersEmail: "careers@cintara.ai",
  privacyEmail: "privacy@cintara.ai",
  address: "Newport Beach, CA",
  hours: "Mon to Fri · 9am to 6pm PT",
} as const;

export const LEGAL_LAST_UPDATED = "July 10, 2026";
