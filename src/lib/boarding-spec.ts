/**
 * Checklist structure aligned with boarding.md (Agent HR onboarding/offboarding workflow).
 * Task ids are stable for persisted completion state.
 */

export type BoardingTask = {
  id: string;
  label: string;
  owner?: string;
  due?: string;
};
export type BoardingStep = { id: string; stepNumber: number; title: string; tasks: BoardingTask[] };

export const ONBOARDING_STEPS: BoardingStep[] = [
  {
    id: "onboard-step-1",
    stepNumber: 1,
    title: "Gather employee information",
    tasks: [
      { id: "onboard-1-full-name", label: "Full name" },
      { id: "onboard-1-dob", label: "Date of birth" },
      { id: "onboard-1-contact", label: "Contact information (email, phone)" },
      { id: "onboard-1-address", label: "Home address" },
      { id: "onboard-1-emergency", label: "Emergency contact information" },
      { id: "onboard-1-national-id", label: "National ID (if applicable)" },
      { id: "onboard-1-bank", label: "Bank details (for payroll setup)" },
      { id: "onboard-1-ssn", label: "Social Security Number (SSN) or equivalent" },
      { id: "onboard-1-position", label: "Position / role within the company" },
      { id: "onboard-1-team-dept", label: "Team name and department" },
      { id: "onboard-1-manager", label: "Name of team leader or manager" },
      { id: "onboard-1-work-location", label: "Work location (office, remote, hybrid)" },
      { id: "onboard-1-start-date", label: "Preferred start date" },
    ],
  },
  {
    id: "onboard-step-2",
    stepNumber: 2,
    title: "Document verification and agreement",
    tasks: [
      { id: "onboard-2-contract", label: "Employment contract sent for signing" },
      { id: "onboard-2-nda", label: "Non-Disclosure Agreement (NDA) sent for signing" },
      {
        id: "onboard-2-policies",
        label: "Company policies (Code of Conduct, Privacy Policy, etc.) sent for signing",
      },
      { id: "onboard-2-benefits", label: "Benefits enrollment form sent for signing" },
      { id: "onboard-2-tax", label: "Tax forms (W-4 or equivalent) sent for signing" },
      { id: "onboard-2-confirmed", label: "Documents signed and stored securely (confirmed)" },
    ],
  },
  {
    id: "onboard-step-3",
    stepNumber: 3,
    title: "Assign role, team, and access",
    tasks: [
      { id: "onboard-3-team", label: "Assign new employee to their designated team" },
      { id: "onboard-3-email", label: "Set up email address" },
      { id: "onboard-3-systems", label: "Set up system access and necessary software tools" },
      { id: "onboard-3-lead", label: "Assign team leader or manager" },
      { id: "onboard-3-comms", label: "Set up communication channels (Slack, Teams, etc.)" },
    ],
  },
  {
    id: "onboard-step-4",
    stepNumber: 4,
    title: "Training and orientation",
    tasks: [
      {
        id: "onboard-4-materials",
        label:
          "Provide access to mandatory training materials, meeting notes/transcripts, and recordings",
      },
      {
        id: "onboard-4-orientation",
        label: "Schedule an orientation session (in-person or virtual)",
      },
      { id: "onboard-4-culture", label: "Share company culture, values, and mission" },
      { id: "onboard-4-306090", label: "Set expectations for the first 30 / 60 / 90 days" },
    ],
  },
  {
    id: "onboard-step-5",
    stepNumber: 5,
    title: "Employee welcome",
    tasks: [
      { id: "onboard-5-welcome-msg", label: "Send a personalized welcome email or message" },
      {
        id: "onboard-5-intro",
        label:
          "Introduce the new hire to their team and schedule meet-and-greet with the team leader",
      },
      {
        id: "onboard-5-resources",
        label: "Provide access to internal employee resources (handbook, intranet, etc.)",
      },
    ],
  },
  {
    id: "onboard-step-6",
    stepNumber: 6,
    title: "Onboarding completion",
    tasks: [
      { id: "onboard-6-equipment", label: "Verify equipment received (laptop, badge, etc.)" },
      { id: "onboard-6-access", label: "Ensure access to all systems and tools has been granted" },
      { id: "onboard-6-google", label: "Google account creation" },
      { id: "onboard-6-timedoctor", label: "Time Doctor setup" },
      { id: "onboard-6-other-it", label: "Other basic IT / tooling requirements completed" },
      {
        id: "onboard-6-confirm-info",
        label: "Confirm with the employee they have all required information to start their role",
      },
    ],
  },
];

export const OFFBOARDING_STEPS: BoardingStep[] = [
  {
    id: "offboard-step-1",
    stepNumber: 1,
    title: "Initiate offboarding request",
    tasks: [
      { id: "offboard-1-date", label: "Confirm the employee’s departure date" },
      {
        id: "offboard-1-notify",
        label: "Notify HR and relevant managers about the offboarding process",
      },
      {
        id: "offboard-1-type",
        label: "Determine whether the departure is voluntary or involuntary",
      },
      {
        id: "offboard-1-notice-proof",
        label: "Receive official resignation/termination notice (written proof)",
        owner: "HR",
        due: "Day 1 of notice",
      },
      {
        id: "offboard-1-hris-last-day",
        label: "Update HRIS with last working day",
        owner: "HR",
        due: "Day 1 of notice",
      },
      {
        id: "offboard-1-align-transition",
        label: "Align with manager on notice period & transition plan",
        owner: "HR + Manager",
        due: "Within 2 days",
      },
      {
        id: "offboard-1-legal",
        label: "Review contract clauses & legal compliance",
        owner: "HR",
        due: "Within 2 days",
      },
      {
        id: "offboard-1-comm-plan",
        label: "Draft internal & external communication plan",
        owner: "HR + Manager",
        due: "Before public announcement",
      },
    ],
  },
  {
    id: "offboard-stage-knowledge-transfer",
    stepNumber: 2,
    title: "Knowledge transfer & handover",
    tasks: [
      {
        id: "offboard-kt-handover-doc",
        label: "Prepare detailed handover document",
        owner: "Employee",
        due: "1 week before last day",
      },
      {
        id: "offboard-kt-transfer-tasks",
        label: "Transfer all active tasks & projects",
        owner: "Employee + Manager",
        due: "3 days before last day",
      },
      {
        id: "offboard-kt-reassign-clients",
        label: "Reassign clients/vendors to new POC",
        owner: "Manager",
        due: "Before last day",
      },
      {
        id: "offboard-kt-transfer-ownership",
        label: "Transfer ownership of shared documents & tools",
        owner: "IT + Employee",
        due: "Before last day",
      },
    ],
  },
  {
    id: "offboard-step-2",
    stepNumber: 3,
    title: "Exit interview",
    tasks: [
      { id: "offboard-2-schedule", label: "Schedule an exit interview with the employee" },
      { id: "offboard-2-q-enjoy", label: "Ask: What did you enjoy most about your role here?" },
      {
        id: "offboard-2-q-improve",
        label: "Ask: What could we improve in terms of company culture, benefits, or support?",
      },
      { id: "offboard-2-q-recommend", label: "Ask: Would you recommend our company to others?" },
      {
        id: "offboard-2-q-workplace",
        label: "Ask: Do you have any suggestions for improving the workplace?",
      },
      {
        id: "offboard-2-q-retain",
        label: "Ask: Is there anything we could have done to retain you?",
      },
      {
        id: "offboard-exit-schedule",
        label: "Schedule exit interview",
        owner: "HR",
        due: "3–5 days before last day",
      },
      {
        id: "offboard-exit-conduct",
        label: "Conduct interview & collect feedback",
        owner: "HR",
        due: "Before last day",
      },
      {
        id: "offboard-exit-share-insights",
        label: "Document & share insights with leadership",
        owner: "HR",
        due: "Within 1 week post-exit",
      },
    ],
  },
  {
    id: "offboard-step-3",
    stepNumber: 4,
    title: "Asset recovery",
    tasks: [
      { id: "offboard-3-laptop", label: "Retrieve laptop or computer equipment" },
      { id: "offboard-3-badge", label: "Retrieve company ID badge" },
      { id: "offboard-3-phone", label: "Retrieve mobile phone or other devices" },
      { id: "offboard-3-keys", label: "Retrieve keys or access cards" },
      {
        id: "offboard-3-confirmed",
        label: "Confirm all company property is returned before finalizing offboarding",
      },
      {
        id: "offboard-it-delete-emails-transfer-data",
        label:
          "Delete official emails on all domains (primary {Employee_Name}@revcloud.com) and transfer data to manager (unshared files + calendar blocks)",
        owner: "IT",
        due: "Last day (end of shift)",
      },
      { id: "offboard-it-disable-timedoctor", label: "Disable the Time Doctor account" },
      { id: "offboard-it-disable-teams", label: "Disable the Microsoft Teams account" },
      {
        id: "offboard-it-disable-systems",
        label:
          "Disable access to AWS, Confluence, Jira, Segment, GitHub (get a list from the manager)",
      },
      {
        id: "offboard-it-disable-building",
        label: "Disable building & badge access",
        owner: "Admin/IT",
        due: "Last day",
      },
      {
        id: "offboard-it-collect-assets",
        label: "Collect all company assets (laptop, phone, accessories, cards, keys)",
        owner: "IT/Facilities",
        due: "Last day",
      },
      {
        id: "offboard-it-backup-wipe",
        label: "Backup all work-related files & wipe personal data",
        owner: "IT",
        due: "Last day",
      },
    ],
  },
  {
    id: "offboard-step-4",
    stepNumber: 5,
    title: "Access revocation",
    tasks: [
      { id: "offboard-4-email", label: "Disable or transfer email accounts" },
      { id: "offboard-4-internal", label: "Revoke internal systems access (CRM, HRIS, etc.)" },
      { id: "offboard-4-external", label: "Revoke external systems and software tools" },
      { id: "offboard-4-vpn", label: "Revoke company VPN and network access" },
      {
        id: "offboard-4-pii",
        label:
          "Securely remove or handle passwords, usernames, and personal information as appropriate",
      },
    ],
  },
  {
    id: "offboard-step-5",
    stepNumber: 6,
    title: "Final pay and benefits",
    tasks: [
      {
        id: "offboard-5-pay",
        label:
          "Calculate final paycheck (unused PTO, bonus, commission, other outstanding payments)",
      },
      {
        id: "offboard-5-benefits",
        label: "Ensure benefits continuation or termination (health, retirement, etc.)",
      },
      {
        id: "offboard-5-docs",
        label: "Provide documentation on benefits after employment (e.g., COBRA in the U.S.)",
      },
      {
        id: "offboard-payroll-final-salary",
        label: "Calculate & process final salary",
        owner: "Payroll",
        due: "Within 3 days post-exit",
      },
      {
        id: "offboard-payroll-settle",
        label: "Settle bonuses, commissions, and reimbursements",
        owner: "Payroll",
        due: "Within 3 days post-exit",
      },
      {
        id: "offboard-hr-terminate-benefits",
        label: "Terminate benefits & insurance coverage",
        owner: "HR",
        due: "Last day",
      },
      {
        id: "offboard-hr-acceptance-letter",
        label: "Issue resignation acceptance letter",
        owner: "HR",
        due: "Last day",
      },
      {
        id: "offboard-hr-relieving-exp",
        label: "Provide relieving letter & experience certificate",
        owner: "HR",
        due: "Within 3 days post-exit",
      },
    ],
  },
  {
    id: "offboard-step-6",
    stepNumber: 6,
    title: "Offboarding documentation",
    tasks: [
      { id: "offboard-6-pay-details", label: "Send final paycheck details" },
      {
        id: "offboard-6-benefits-status",
        label: "Send benefits status (continuation or termination)",
      },
      { id: "offboard-6-separation", label: "Separation agreement or release (if applicable)" },
      { id: "offboard-6-certificate", label: "Certificate of Employment (if requested)" },
      { id: "offboard-6-store", label: "Store all offboarding documents in the employee’s record" },
    ],
  },
  {
    id: "offboard-step-7",
    stepNumber: 7,
    title: "Notify team and update records",
    tasks: [
      {
        id: "offboard-7-stakeholders",
        label: "Notify team members and relevant departments (IT, Facilities, etc.)",
      },
      { id: "offboard-7-hris", label: "Update HR system: status set to Offboarded or Terminated" },
      {
        id: "offboard-7-comms",
        label: "Remove from team communications (email lists, Slack channels, etc.)",
      },
    ],
  },
  {
    id: "offboard-step-8",
    stepNumber: 8,
    title: "Exit communication",
    tasks: [
      {
        id: "offboard-8-formal",
        label: "Send formal offboarding email (last day, next steps, last instructions)",
      },
      {
        id: "offboard-8-thanks",
        label: "Send a thank-you message acknowledging contributions and wishing them well",
      },
    ],
  },
  {
    id: "offboard-step-9",
    stepNumber: 10,
    title: "Offboarding completion",
    tasks: [
      {
        id: "offboard-9-pre-departure",
        label: "Ensure all offboarding steps are completed before departure",
      },
      {
        id: "offboard-9-systems",
        label: "Confirm the employee is no longer in company systems or communications",
      },
      { id: "offboard-9-close", label: "Finalize offboarding and close the employee’s record" },
    ],
  },
  {
    id: "offboard-stage-post-exit",
    stepNumber: 11,
    title: "Post-exit follow-up",
    tasks: [
      {
        id: "offboard-post-appreciation",
        label: "Send appreciation/acknowledgment email",
        owner: "Manager/HR",
        due: "Last day",
      },
      {
        id: "offboard-post-alumni",
        label: "Update references & alumni database",
        owner: "HR",
        due: "Within 1 week post-exit",
      },
      {
        id: "offboard-post-reassure-team",
        label: "Reassure team about workload coverage",
        owner: "Manager",
        due: "Immediately after exit",
      },
    ],
  },
];

export function allTaskIds(steps: BoardingStep[]): string[] {
  return steps.flatMap((s) => s.tasks.map((t) => t.id));
}

export const ONBOARDING_TASK_IDS = allTaskIds(ONBOARDING_STEPS);
export const OFFBOARDING_TASK_IDS = allTaskIds(OFFBOARDING_STEPS);
