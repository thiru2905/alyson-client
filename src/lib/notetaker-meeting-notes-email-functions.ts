import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { previewMeetingNotesEmail, sendMeetingNotesEmail } from "@/lib/meeting-notes-email.server";

const BotNotesInput = z.object({
  botId: z.string().min(1),
  notesMd: z.string().optional(),
  title: z.string().optional(),
  subject: z.string().optional(),
  heading: z.string().optional(),
  recipients: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .optional(),
});

export const previewMeetingNotesEmailFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BotNotesInput.parse(data))
  .handler(async ({ data }) => previewMeetingNotesEmail(data));

export const sendMeetingNotesEmailFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BotNotesInput.parse(data))
  .handler(async ({ data }) => {
    const sent = await sendMeetingNotesEmail(data);
    // Mark S3 so auto-email never re-sends after a manual send.
    try {
      const { recordMeetingNotesEmailSent } = await import(
        "@/lib/notetaker-meeting-notes-auto-email.server"
      );
      await recordMeetingNotesEmailSent(data.botId, {
        sentAt: new Date().toISOString(),
        messageId: sent.messageId,
        recipients: sent.recipients,
      });
    } catch {
      // Delivery already succeeded; index mark is best-effort.
    }
    return sent;
  });
