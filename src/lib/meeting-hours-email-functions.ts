import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildAndSendMeetingHoursReportEmail,
  meetingHoursReportDays,
  meetingHoursReportRange,
  meetingHoursReportRecipients,
  previewMeetingHoursReportEmail,
} from "@/lib/meeting-hours-email.server";
import { sesConfigured } from "@/lib/ses-mail.server";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const show = local.length <= 2 ? local : `${local.slice(0, 2)}…`;
  return `${show}@${domain}`;
}

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PreviewInput = superAccessInputSchema.extend({
  start: IsoDate.optional(),
  end: IsoDate.optional(),
  employeeCount: z.number().int().nonnegative().nullable().optional(),
});

const SendInput = superAccessInputSchema.extend({
  forceRefresh: z.boolean().optional(),
  start: IsoDate.optional(),
  end: IsoDate.optional(),
  subject: z.string().min(1).optional(),
  recipients: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .min(1)
    .optional(),
});

export const getMeetingHoursEmailInfo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const recipients = meetingHoursReportRecipients();
    const enabled =
      String(process.env.MEETING_HOURS_REPORT_ENABLED ?? "true").trim().toLowerCase() !== "false";
    const range = meetingHoursReportRange();

    return {
      enabled,
      sesConfigured: sesConfigured(),
      recipients: recipients.map(maskEmail),
      recipientCount: recipients.length,
      reportDays: meetingHoursReportDays(),
      range,
      cronScheduleLabel: "Every Monday at 7:00 AM IST (Vercel cron)",
    };
  });

export const previewMeetingHoursReportEmailFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PreviewInput.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    return previewMeetingHoursReportEmail({
      start: data.start,
      end: data.end,
      employeeCount: data.employeeCount,
    });
  });

export const sendMeetingHoursReportEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SendInput.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const recipients = data.recipients?.map((r) => r.email.trim().toLowerCase());
    return buildAndSendMeetingHoursReportEmail({
      start: data.start,
      end: data.end,
      forceRefresh: data.forceRefresh ?? true,
      subject: data.subject,
      recipients,
    });
  });
