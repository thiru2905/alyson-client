import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DeleteInput = z.object({
  botId: z.string().min(1),
  code: z.string().min(1),
});

/** Meeting sessions are retained — delete is intentionally disabled for everyone. */
export const deleteNotetakerSessionFromS3 = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteInput.parse(data))
  .handler(async () => {
    throw new Error("Meeting sessions cannot be deleted.");
  });
