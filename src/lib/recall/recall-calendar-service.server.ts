import { randomUUID } from "node:crypto";
import {
  bootstrapRecallCalendarFromEnv,
  buildGoogleCalendarOAuthUrl,
  exchangeGoogleOAuthCode,
  recallCalendarWebhookUrl,
} from "@/lib/recall/google-calendar-oauth.server";
import { createRecallCalendar, deleteRecallCalendar, getRecallCalendar } from "@/lib/recall/recall-calendar-v2.server";
import {
  getConnectedRecallCalendars,
  readRecallCalendarState,
  removeRecallCalendarConnection,
  upsertRecallCalendarConnection,
} from "@/lib/recall/recall-calendar-state-s3.server";
import { signOAuthState, syncRecallCalendarEvents, verifyOAuthState } from "@/lib/recall/recall-calendar-sync.server";
import type { RecallCalendarWebhookPayload } from "@/lib/recall/recall-calendar-types";
import { googleOAuthClientId, googleOAuthClientSecret } from "@/lib/recall/google-calendar-oauth.server";

export async function getRecallCalendarStatus() {
  const state = await readRecallCalendarState();
  const connected = getConnectedRecallCalendars(state);
  return {
    webhookUrl: recallCalendarWebhookUrl(),
    connected,
    total: state.connections.length,
  };
}

export function startRecallCalendarConnect(origin?: string, returnTo?: string): string {
  const state = signOAuthState({ nonce: randomUUID(), returnTo });
  return buildGoogleCalendarOAuthUrl(state, origin);
}

export async function completeRecallCalendarConnect(code: string, stateToken: string, origin?: string) {
  const state = verifyOAuthState(stateToken);
  if (!state) throw new Error("Invalid OAuth state");

  const tokens = await exchangeGoogleOAuthCode(code, origin);
  const cal = await createRecallCalendar({
    platform: "google_calendar",
    oauthClientId: googleOAuthClientId(),
    oauthClientSecret: googleOAuthClientSecret(),
    oauthRefreshToken: tokens.refreshToken,
    oauthEmail: tokens.email,
    metadata: { source: "alyson_oauth_connect" },
  });

  const email = tokens.email || String(cal.platform_email || cal.oauth_email || "connected");
  await upsertRecallCalendarConnection({
    recallCalendarId: cal.id,
    platform: "google_calendar",
    email,
    connectedAt: new Date().toISOString(),
    status: "connected",
  });

  const sync = await syncRecallCalendarEvents({ calendarId: cal.id });
  return { calendarId: cal.id, email, sync, returnTo: state.returnTo };
}

export async function disconnectRecallCalendar(calendarId: string) {
  await deleteRecallCalendar(calendarId);
  await removeRecallCalendarConnection(calendarId);
  return { disconnected: true, calendarId };
}

export async function syncRecallCalendarNow(calendarId: string, updatedAtGte?: string) {
  const cal = await getRecallCalendar(calendarId);
  if (cal.status === "disconnected") {
    throw new Error("Calendar is disconnected on Recall — reconnect Google Calendar");
  }
  return syncRecallCalendarEvents({ calendarId, updatedAtGte });
}

export async function handleRecallCalendarWebhook(payload: RecallCalendarWebhookPayload) {
  if (payload.event === "calendar.sync_events") {
    const { calendar_id, last_updated_ts } = payload.data;
    return syncRecallCalendarEvents({ calendarId: calendar_id, updatedAtGte: last_updated_ts });
  }

  if (payload.event === "calendar.update") {
    const cal = await getRecallCalendar(payload.data.calendar_id);
    if (cal.status === "disconnected") {
      const { markRecallCalendarDisconnected } = await import("@/lib/recall/recall-calendar-state-s3.server");
      await markRecallCalendarDisconnected(payload.data.calendar_id);
      return { action: "marked_disconnected", calendarId: payload.data.calendar_id };
    }
    return { action: "calendar_update_noted", calendarId: payload.data.calendar_id, status: cal.status };
  }

  return { action: "ignored" };
}

export async function registerRecallCalendarFromEnvIfNeeded() {
  const boot = await bootstrapRecallCalendarFromEnv();
  if (!boot) return null;

  await upsertRecallCalendarConnection({
    recallCalendarId: boot.recallCalendarId,
    platform: "google_calendar",
    email: boot.email,
    connectedAt: new Date().toISOString(),
    status: "connected",
  });

  const sync = await syncRecallCalendarEvents({ calendarId: boot.recallCalendarId });
  return { ...boot, sync };
}
