import { z } from "zod";

export const superAccessInputSchema = z.object({
  clerkToken: z.string().min(1),
  emailHint: z.string().email().optional(),
});

export type SuperAccessInput = z.infer<typeof superAccessInputSchema>;
