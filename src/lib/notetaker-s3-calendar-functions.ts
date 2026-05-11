import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNotesMdFromS3, getTranscriptTextFromS3, listMeetingsFromS3 } from "@/lib/notetaker-s3-calendar.server";

const RangeInput = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listMeetingsFromS3Range = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => RangeInput.parse(data))
  .handler(async ({ data }) => {
    const meetings = await listMeetingsFromS3({ start: data.start, end: data.end });
    return { meetings };
  });

const NotesInput = z.object({ notesKey: z.string().min(1) });

export const getMeetingNotesMdFromS3 = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => NotesInput.parse(data))
  .handler(async ({ data }) => {
    const notesMd = await getNotesMdFromS3({ notesKey: data.notesKey });
    return { notesMd };
  });

const TranscriptInput = z.object({ transcriptKey: z.string().min(1) });

export const getMeetingTranscriptTextFromS3 = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => TranscriptInput.parse(data))
  .handler(async ({ data }) => {
    const transcriptText = await getTranscriptTextFromS3({ transcriptKey: data.transcriptKey });
    return { transcriptText };
  });

