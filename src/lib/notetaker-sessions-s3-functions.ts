import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNotetakerSessionsIndexFromS3, putNotetakerSessionsIndexToS3 } from "@/lib/notetaker-sessions-s3.server";
import { listNotetakerSessions } from "@/lib/alyson-notetaker-functions";

export const getNotetakerSessionsIndexFromS3Fn = createServerFn({ method: "GET" }).handler(async () => {
  return await getNotetakerSessionsIndexFromS3();
});

const SyncInput = z.object({
  persistOnly: z.boolean().optional(),
});

export const syncNotetakerSessionsIndexToS3 = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SyncInput.parse(data))
  .handler(async () => {
    const live = await listNotetakerSessions();
    return await putNotetakerSessionsIndexToS3({ sessions: live.sessions ?? [] });
  });

