import { google } from "googleapis";

export type ReportsV1Client = ReturnType<typeof google.admin>;

type ActivitiesListParams = {
  userKey: string;
  applicationName: string;
  eventName: string;
  startTime: string;
  endTime: string;
  maxResults?: number;
  pageToken?: string;
};

type ActivitiesListResponse = {
  data: {
    items?: Array<{
      id?: { time?: string };
      events?: Array<{ name?: string; parameters?: unknown[] }>;
    }>;
    nextPageToken?: string | null;
  };
};

/** google.admin reports_v1: use `activities.list`, not `activities()` (legacy). */
export async function listReportActivities(
  reportsClient: ReportsV1Client,
  params: ActivitiesListParams,
): Promise<ActivitiesListResponse> {
  const resource = reportsClient.activities as
    | { list?: (p: ActivitiesListParams) => Promise<ActivitiesListResponse> }
    | (() => { list: (p: ActivitiesListParams) => Promise<ActivitiesListResponse> });

  if (resource && typeof resource === "object" && typeof resource.list === "function") {
    return resource.list(params);
  }

  if (typeof resource === "function") {
    return resource().list(params);
  }

  throw new Error("Google Reports activities.list is not available on this client");
}
