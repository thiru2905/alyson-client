export const DEFAULT_BOT_JOIN_REPORT_EMAIL = "alysonclient@cintara.ai";

export type CalendarMeetingRef = {
  googleEventId: string;
  title: string;
  startTime: string;
  endTime: string | null;
  meetingUrl: string;
  dedupeKey: string;
};

export type BotJoinDailyPoint = {
  day: string;
  eligibleMeetings: number;
  meetingsJoined: number;
  meetingsMissed: number;
  joinRatePercent: number | null;
  avgLateMinutes: number | null;
  maxLateMinutes: number | null;
};

export type BotJoinReportRow = {
  botId: string;
  title: string;
  meetingUrl: string | null;
  scheduledStart: string | null;
  /** Calendar meeting start used for lateness (when reliable). */
  meetingStartAt?: string | null;
  meetingStartReliable?: boolean;
  calendarUserEmail: string;
  googleEventId?: string;
  source: "unified_scheduled" | "s3_index" | "notetaker_session" | "recall_calendar" | "unknown";
  creationSource?: string;
  scheduledAt?: string;
  botJoinAt?: string;
  joiningCallAt: string | null;
  waitingRoomEnteredAt: string | null;
  admittedAt: string | null;
  waitingRoomSeconds: number | null;
  waitingRoomLabel: string;
  /** Seconds after scheduled start when admitted (negative = early). */
  lateToStartSeconds: number | null;
  lateToStartLabel: string;
  lateMinutes: number | null;
  finalStatus: string;
  joinedMeeting: boolean;
  stuckInWaitingRoom: boolean;
  fatalSubCode: string | null;
  recallFetchError?: string;
};

export type BotJoinCriticalMetrics = {
  /** Eligible calendar meetings (Meet link, not skipped). */
  totalEligibleMeetings: number;
  /** Bot successfully admitted to the call. */
  meetingsJoined: number;
  /** Eligible meetings with no successful join. */
  meetingsMissed: number;
  /** meetingsJoined / totalEligibleMeetings */
  joinRatePercent: number | null;
  /** Avg minutes late to scheduled start (joined meetings only, when late). */
  avgLateMinutes: number | null;
  /** Worst admission delay vs scheduled start. */
  maxLateMinutes: number | null;
  /** Joined meetings admitted more than 2 min after start. */
  meetingsJoinedLate: number;
  /** Never admitted from waiting room. */
  stuckInWaitingRoom: number;
  /** Recall fatal status. */
  failedJoins: number;
  /** Bots scheduled but join unknown / no Recall data. */
  scheduledNotJoined: number;
};

export type BotJoinReportDiagnostics = {
  botsFromNotetakerSessions: number;
  botsFromUnifiedState: number;
  botsFromS3Index: number;
  botsFromRecallCalendar: number;
  warnings: string[];
  recallBotsFromListApi?: number;
  recallBotsFromCache?: number;
  recallBotsSkippedFetch?: number;
};

export type BotJoinReport = {
  range: { start: string; end: string };
  calendarEmail: string;
  generatedAt: string;
  recallConfigured: boolean;
  calendarAvailable: boolean;
  calendarError?: string;
  diagnostics: BotJoinReportDiagnostics;
  critical: BotJoinCriticalMetrics;
  /** Calendar-eligible meetings the bot successfully joined. */
  joinedMeetings: BotJoinReportRow[];
  /** Eligible calendar meetings with no successful bot join. */
  missedMeetings: CalendarMeetingRef[];
  /** Per-day join rate and lateness trends. */
  daily: BotJoinDailyPoint[];
  rows: BotJoinReportRow[];
};
