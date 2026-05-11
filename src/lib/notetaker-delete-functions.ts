import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deletePersistedMeetingFromS3ByBotId } from "@/lib/notetaker-s3-delete.server";
import { getNotetakerSessionsIndexFromS3, putNotetakerSessionsIndexToS3 } from "@/lib/notetaker-sessions-s3.server";

const DeleteInput = z.object({
  botId: z.string().min(1),
  code: z.string().min(1),
});

export const deleteNotetakerSessionFromS3 = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteInput.parse(data))
  .handler(async ({ data }) => {
    if (String(data.code).trim() !== "75391") {
      throw new Error("Invalid super admin code.");
    }

    const botId = String(data.botId);
    const del = await deletePersistedMeetingFromS3ByBotId(botId);

    // Best-effort: also remove from S3 sessions index so it disappears from S3-backed sessions lists.
    try {
      const idx = await getNotetakerSessionsIndexFromS3();
      const next = (idx.sessions ?? []).filter((s) => String((s as any)?.botId || "") !== botId);
      if (next.length !== (idx.sessions ?? []).length) {
        await putNotetakerSessionsIndexToS3({ sessions: next });
      }
    } catch {
      // ignore index update failures; the core delete already happened
    }

    return del;
  });

