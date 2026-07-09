import { createServerFn } from "@tanstack/react-start";
import { superAccessInputSchema } from "@/lib/super-access-input";
import type { SuperAccessCheckResult } from "@/lib/super-access-rbac.schema";

export type { SuperAccessCheckResult } from "@/lib/super-access-rbac.schema";

export const checkSuperAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }): Promise<SuperAccessCheckResult> => {
    const { checkSuperAccessForToken } = await import("@/lib/super-access-rbac.server");
    return checkSuperAccessForToken(data.clerkToken, data.emailHint);
  });
