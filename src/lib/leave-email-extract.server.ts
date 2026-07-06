import { deepseekApiKey, deepseekChat, extractJsonObject, resolveDeepseekModel } from "@/lib/groq-chat.server";
import {
  LeaveEmailExtractionSchema,
  type LeaveEmailExtraction,
} from "@/lib/leave-email-schema";
import type { LeaveEmailMessage } from "@/lib/leave-email-gmail.server";

const SYSTEM_PROMPT = `You are Alyson HR leave intake. Parse ONE email and return ONLY valid JSON matching the schema.

Rules:
- Timezone: Asia/Kolkata (IST) for all dates.
- Count leave days as weekdays only (Mon–Fri); exclude weekends unless email explicitly says weekend work leave.
- leaveType: annual (default vacation/PTO), sick (illness), personal, unpaid, other.
- isLeaveRequest: false for FYI, meeting invites, payroll, non-leave threads.
- isCancellation: true if user cancels or withdraws previously requested leave.
- Extract employee email from From: header; if manager writes for someone else, set matchedFrom=manager_on_behalf and extract the employee from body.
- tone: classify overall tone (formal/casual/urgent/apologetic/neutral) with one-line summary.
- confidence 0–1: lower if dates ambiguous, missing year, or unclear if leave vs WFH.
- warnings: list every ambiguity; never hide uncertainty.
- days: integer weekdays; if email states "2 days", use that if dates align; else compute from start/end.
- Do not fabricate emails or dates not supported by the email text.

Output JSON only, no markdown.`;

const JSON_SHAPE = `{
  "isLeaveRequest": boolean,
  "confidence": number,
  "employee": { "name": string, "email": string|null, "matchedFrom": "from_header"|"body_signature"|"manager_on_behalf"|"unknown" },
  "leave": {
    "leaveType": "annual"|"sick"|"personal"|"unpaid"|"other",
    "startDate": "YYYY-MM-DD"|null,
    "endDate": "YYYY-MM-DD"|null,
    "days": number|null,
    "reason": string|null,
    "halfDay": boolean,
    "isCancellation": boolean,
    "cancelsEventId": string|null
  },
  "tone": { "label": "formal"|"casual"|"urgent"|"apologetic"|"neutral", "summary": string },
  "warnings": string[],
  "rawSummary": string
}`;

export async function extractLeaveFromEmail(msg: LeaveEmailMessage): Promise<LeaveEmailExtraction> {
  if (!deepseekApiKey()) {
    throw new Error("DEEPSEEK_API_KEY is required for leave email intake.");
  }

  const todayIst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const userContent = [
    `Today's date (IST): ${todayIst}`,
    `From header: ${msg.fromName} <${msg.fromEmail}>`,
    `Subject: ${msg.subject}`,
    `Received: ${msg.receivedAt}`,
    "",
    "Email body:",
    msg.bodyText.slice(0, 10_000),
  ].join("\n");

  const model = await resolveDeepseekModel();
  const raw = await deepseekChat(
    [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nSchema:\n${JSON_SHAPE}` },
      { role: "user", content: userContent },
    ],
    0.1,
    { model },
  );

  const parsed = LeaveEmailExtractionSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    throw new Error(`DeepSeek leave parse failed: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
