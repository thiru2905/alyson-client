/** Client-safe types for Groq workspace focus analysis. */

export type FocusCluster = {
  label: string;
  description: string;
  count: number;
  sharePercent: number;
  examples: string[];
};

export type EmployeeWorkspaceAiAnalysis = {
  generatedAt: string;
  model: string;
  userEmail: string;
  displayName: string;
  summary: string;
  primaryFocus: string;
  workThemes: string[];
  emailClusters: FocusCluster[];
  chatClusters: FocusCluster[];
  docClusters: FocusCluster[];
  meetingClusters: FocusCluster[];
  limitations: string[];
  corpusStats: {
    auditEmails: number;
    gmailSnippets: number;
    chats: number;
    docs: number;
    meetings: number;
    timeDoctorApps: number;
  };
};
