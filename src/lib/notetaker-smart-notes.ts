import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  title: z.string().optional(),
  transcriptText: z.string().min(1).max(500_000),
});

export const generateSmartMeetingNotes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { runSmartMeetingNotes } = await import("@/lib/notetaker-smart-notes.server");
    return runSmartMeetingNotes(data);
  });
