/** Client-safe types for Workspace activity (no googleapis imports). */

export type WorkspaceActivityRow = {
  userEmail: string;
  emailsSent: number;
  meetingsCreated: number;
  docsCreated: number;
  chatMessagesSent: number;
};

export type WorkspaceActivityResponse = {
  range: { start: string; end: string };
  generatedAt: string;
  usersProcessed: number;
  rows: WorkspaceActivityRow[];
  warnings: string[];
};

export type WorkspaceActivityItem = {
  at: string;
  kind: "email" | "chat" | "doc" | "meeting";
  title: string;
  detail?: string;
  /** Plain-text preview (email body, chat text, doc excerpt). */
  preview?: string;
  bodyChars?: number;
  bodyWords?: number;
  /** Heuristic label, e.g. meeting, support, sales, internal, general. */
  category?: string;
  to?: string;
  room?: string;
  mimeType?: string;
  source?: "audit" | "gmail" | "drive" | "calendar" | "chat";
  meta?: Record<string, string>;
};

export type WorkspaceActivityDetailStats = {
  emails: { count: number; totalBodyChars: number; avgBodyChars: number };
  chats: { count: number; totalBodyChars: number; avgBodyChars: number };
  docs: { count: number; totalBodyChars: number; totalWords: number; avgWords: number };
  meetings: { count: number };
};

export type WorkspaceActivityEmailBodyResult = {
  subject: string;
  to?: string;
  cc?: string;
  from?: string;
  sentAt?: string;
  body: string;
  source: "gmail" | "preview";
};

export type WorkspaceUserActivityDetail = {
  userEmail: string;
  range: { start: string; end: string };
  generatedAt: string;
  emails: WorkspaceActivityItem[];
  chats: WorkspaceActivityItem[];
  docs: WorkspaceActivityItem[];
  meetings: WorkspaceActivityItem[];
  focusHints: string[];
  warnings: string[];
  gmailEnriched: boolean;
  docsEnriched: boolean;
  chatEnriched: boolean;
  stats: WorkspaceActivityDetailStats;
};

export type GmailSentSnippet = {
  at: string;
  subject: string;
  snippet: string;
  to?: string;
  preview?: string;
  bodyChars?: number;
  bodyWords?: number;
  category?: string;
  meta?: Record<string, string>;
};
