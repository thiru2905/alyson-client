export type HourlyActivityRow = {
  day: string;
  hour: number;
  timeDoctorMinutes: number;
  activeMinutes: number;
  inactiveMinutes: number;
  meetingsAttended: number;
  chatMessages: number;
  emails: number;
  docsCreated: number;
  wordsTypedOrSpoken: number;
  working: "Yes" | "No";
  hoursCredit: number;
};

export type HourlyActivityResponse = {
  range: { start: string; end: string };
  userEmail: string;
  displayName: string;
  generatedAt: string;
  rows: HourlyActivityRow[];
  warnings: string[];
};
