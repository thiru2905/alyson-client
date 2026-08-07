import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getNotetakerSession } from "@/lib/notetaker-get-session-functions";
import { autoPersistEndedMeetingToS3 } from "@/lib/notetaker-auto-persist.server";

const BotIdAuthInput = z.object({
  botId: z.string().min(1),
  clerkToken: z.string().min(1),
  emailHint: z.string().min(1).optional(),
});

/** Manual persist (overwrites S3, regenerates notes). Auto-persist runs when a meeting ends. */
export const finalizeAndPersistNotetakerSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BotIdAuthInput.parse(data))
  .handler(async ({ data }) => {
    const sess = await getNotetakerSession({
      data: {
        botId: data.botId,
        clerkToken: data.clerkToken,
        emailHint: data.emailHint,
      },
    });

    const result = await autoPersistEndedMeetingToS3({
      session: sess.session,
      lines: sess.lines ?? [],
      existingNotesMd: sess.notesMd,
      existingNotesModel: sess.notesModel,
      force: true,
      forceNotes: true,
    });

    if (!result.persisted && result.skipped === "empty_transcript") {
      throw new Error("No transcript lines to persist.");
    }

    return {
      persisted: {
        botId: data.botId,
        persisted: result.persisted,
        skipped: result.skipped,
      },
    };
  });

/** Pull full transcript from Recall post-meeting artifact when live capture was partial. */
export const syncNotetakerTranscriptFromRecall = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BotIdAuthInput.parse(data))
  .handler(async ({ data }) => {
    const { resolveMeetingVisibilityViewer, assertViewerCanAccessMeetingAsset } = await import(
      "@/lib/meeting-visibility.server"
    );
    const viewer = await resolveMeetingVisibilityViewer(data.clerkToken, data.emailHint);
    await assertViewerCanAccessMeetingAsset({ viewer, botId: data.botId });

    const { backfillTranscriptFromRecall, inspectRecallTranscriptBackfill } = await import(
      "@/lib/recall/recall-transcript-backfill.server"
    );
    const inspect = await inspectRecallTranscriptBackfill(data.botId);
    const result = await backfillTranscriptFromRecall(data.botId);
    return { inspect, result };
  });

const IntegrityInput = z
  .object({
    repair: z.boolean().optional(),
  })
  .optional();

/** Run automated meeting calendar integrity audit (+ optional auto-repair). */
export const runNotetakerMeetingIntegrityFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => IntegrityInput.parse(data) ?? {})
  .handler(async ({ data }) => {
    const { runNotetakerMeetingIntegrityCheck } = await import(
      "@/lib/notetaker-meeting-integrity.server"
    );
    return runNotetakerMeetingIntegrityCheck({ repair: data?.repair ?? true });
  });

