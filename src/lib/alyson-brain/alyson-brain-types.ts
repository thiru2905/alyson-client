export type AlysonBrainRange = {
  startIso: string;
  endIso: string;
  label: string;
};

export type AlysonBrainResolvedEmployee = {
  queryName: string;
  email: string;
  displayName: string;
  matchConfidence: "exact" | "partial" | "ambiguous";
  alternatives?: string[];
};

export type AlysonBrainScoringSlice = {
  rank: number;
  grade: string;
  compositeScore: number;
  workHours: number;
  hoursPerDay: number;
  emailsSent: number;
  meetingsCreated: number;
  docsCreated: number;
  chatMessagesSent: number;
  percentile: {
    workHours: number;
    meetings: number;
    emails: number;
    chat: number;
    docs: number;
  };
};

export type AlysonBrainWorkspaceSlice = {
  emailsSent: number;
  meetingsCreated: number;
  docsCreated: number;
  chatMessagesSent: number;
};

export type AlysonBrainTimeDoctorSlice = {
  name: string;
  title: string;
  rangeHours: number;
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
};

export type AlysonBrainPacingSlice = {
  hoursWorked: number;
  hoursExpected: number;
  paceDelta: number;
  projectedPace: number;
  leaveDays: number;
  status: string;
  metTarget: boolean;
  requiredHoursPerDay?: number;
};

export type AlysonBrainBonusSlice = {
  employeeName: string;
  team: string;
  jobTitle: string;
  bonusPaidUsd: number;
  totalBonusAllTime: number;
  bonusEventCount: number;
};

export type AlysonBrainLeaveSlice = {
  employeeName: string;
  team: string;
  daysTakenInRange: number;
  leaveEventCount: number;
};

export type AlysonBrainMeetingsSlice = {
  meetingsAttended: number;
  analyzedMeetings: number;
  totalUtterances: number;
  totalWords: number;
  meetingsSpoken: number;
  topMeetings: Array<{ title: string; day: string; utterances: number }>;
};

export type AlysonBrainTasksSlice = {
  taskCount: number;
  openCount: number;
  meetingsAnalyzed: number;
  tasks: Array<{
    title: string;
    status: string;
    priority: string;
    dueHint: string | null;
    meetingTitle: string;
  }>;
};

export type AlysonBrainEmployeeDashboard = {
  employee: AlysonBrainResolvedEmployee;
  scoring: AlysonBrainScoringSlice | null;
  workspace: AlysonBrainWorkspaceSlice | null;
  timeDoctor: AlysonBrainTimeDoctorSlice | null;
  weeklyPacing: AlysonBrainPacingSlice | null;
  monthlyPacing: AlysonBrainPacingSlice | null;
  bonus: AlysonBrainBonusSlice | null;
  leave: AlysonBrainLeaveSlice | null;
  meetings: AlysonBrainMeetingsSlice | null;
  tasks: AlysonBrainTasksSlice | null;
};

export type AlysonBrainDashboardPayload = {
  range: AlysonBrainRange;
  employees: AlysonBrainEmployeeDashboard[];
  warnings: string[];
  generatedAt: string;
};

export type AlysonBrainInsights = {
  narrative: string;
  provider: string;
  model: string;
  generatedAt: string;
};
