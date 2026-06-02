import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  deleteHandoverDocFromS3,
  getHandoverDocsFromS3,
  upsertHandoverDocInS3,
} from "@/lib/handover-docs-s3.server";

const upsertInput = z.object({
  employeeName: z.string().min(1, "Employee name is required").max(120),
  docUrl: z.string().url("Enter a valid documentation URL"),
});

const deleteInput = z.object({
  id: z.string().min(1),
});

export const getHandoverDocs = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await getHandoverDocsFromS3();
  return { rows };
});

export const upsertHandoverDoc = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertInput.parse(data))
  .handler(async ({ data }) => {
    const rows = await upsertHandoverDocInS3(data);
    return { rows };
  });

export const deleteHandoverDoc = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteInput.parse(data))
  .handler(async ({ data }) => {
    const rows = await deleteHandoverDocFromS3(data.id);
    return { rows };
  });
