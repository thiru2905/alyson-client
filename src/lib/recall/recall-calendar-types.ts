export type RecallCalendarPlatform = "google_calendar" | "microsoft_outlook";

export type RecallCalendarEvent = {
  id: string;
  start_time: string;
  end_time: string;
  calendar_id: string;
  meeting_url: string | null;
  meeting_platform: string | null;
  ical_uid: string;
  platform_id: string;
  is_deleted: boolean;
  updated_at: string;
  raw?: Record<string, unknown>;
  bots?: Array<{
    bot_id: string;
    start_time: string;
    deduplication_key: string;
    meeting_url: string;
  }>;
};

export type RecallCalendarSyncWebhook = {
  event: "calendar.sync_events";
  data: {
    calendar_id: string;
    last_updated_ts: string;
  };
};

export type RecallCalendarUpdateWebhook = {
  event: "calendar.update";
  data: {
    calendar_id: string;
  };
};

export type RecallCalendarWebhookPayload = RecallCalendarSyncWebhook | RecallCalendarUpdateWebhook;
