import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RangeInput = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listPersistedMeetings = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => RangeInput.parse(data))
  .handler(async ({ data }) => {
    if (!process.env.ALYSON_DUMP_SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing ALYSON_DUMP_SUPABASE_SERVICE_ROLE_KEY (required for Calendar queries)");
    }

    const startIso = `${data.start}T00:00:00.000Z`;
    const endIso = `${data.end}T23:59:59.999Z`;

    const { data: rows, error } = await supabaseAdmin
      .from("meeting_sessions")
      .select("id, bot_id, title, started_at, ended_at, finalized_at")
      .gte("ended_at", startIso)
      .lte("ended_at", endIso)
      .not("finalized_at", "is", null)
      .order("ended_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { meetings: rows ?? [] };
  });

