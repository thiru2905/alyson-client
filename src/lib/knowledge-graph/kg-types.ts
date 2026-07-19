/** Domain model for Alyson Knowledge Graph (Neo4j). */

export type KgPerson = {
  email: string;
  name?: string;
  domain?: string;
};

export type KgMeeting = {
  botId: string;
  title: string;
  startedAt?: string | null;
  meetingDay?: string | null;
  prefix?: string;
  transcriptHash?: string | null;
  notesHash?: string | null;
};

export type KgProject = {
  key: string;
  name: string;
  confidence?: number;
};

export type KgTask = {
  key: string;
  text: string;
  status?: string;
};

export type KgTopic = {
  key: string;
  name: string;
};

export type KgDocument = {
  driveId: string;
  title: string;
  mimeType?: string;
  url?: string;
};

export type KgEmail = {
  messageId: string;
  subject: string;
  sentAt?: string;
};

export type KgChatMessage = {
  messageId: string;
  spaceName?: string;
  preview?: string;
  createdAt?: string;
};

export type KgEdgeType =
  | "ATTENDED"
  | "ORGANIZED"
  | "MENTIONS"
  | "WORKS_ON"
  | "ASSIGNED_TO"
  | "ABOUT"
  | "RELATED_TO"
  | "CREATED"
  | "SENT"
  | "POSTED_IN";

export type KgExtractedGraph = {
  people: KgPerson[];
  projects: KgProject[];
  tasks: KgTask[];
  topics: KgTopic[];
  relationships: Array<{
    type: KgEdgeType;
    from: { kind: "Person" | "Meeting" | "Project" | "Task" | "Topic"; key: string };
    to: { kind: "Person" | "Meeting" | "Project" | "Task" | "Topic"; key: string };
    evidence?: string;
  }>;
};

export type KgMeetingSyncResult = {
  botId: string;
  upserted: boolean;
  skipped?: string;
  people: number;
  projects: number;
  tasks: number;
  topics: number;
  relationships: number;
  error?: string;
};

export type KgSyncRunResult = {
  ok: boolean;
  ranAt: string;
  enabled: boolean;
  scanned: number;
  synced: number;
  skipped: number;
  errors: number;
  results: KgMeetingSyncResult[];
  warnings: string[];
};
