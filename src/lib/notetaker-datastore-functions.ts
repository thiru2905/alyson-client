import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPersistedSession } from "@/lib/notetaker-datastore.server";

const BotIdInput = z.object({ botId: z.string().min(1) });

export const getPersistedNotetakerSession = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => BotIdInput.parse(data))
  .handler(async ({ data }) => {
    const persisted = await getPersistedSession(data.botId);
    return { persisted };
  });

