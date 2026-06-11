import { createFileRoute } from "@tanstack/react-router";
import { notetakerBaseUrl } from "@/lib/notetaker-upstream.server";

/**
 * Recall transcript webhooks are often configured with PUBLIC_WEBHOOK_BASE_URL
 * (e.g. api-v2.1.alysonhr.com). Forward them to the Notetaker service.
 */
export const Route = createFileRoute("/webhooks/recall")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const target = `${notetakerBaseUrl()}/webhooks/recall`;
        const headers = new Headers();
        const contentType = request.headers.get("content-type");
        if (contentType) headers.set("content-type", contentType);
        for (const name of request.headers.keys()) {
          const lower = name.toLowerCase();
          if (lower === "host" || lower === "content-length") continue;
          if (lower.startsWith("svix-") || lower.startsWith("webhook-") || lower === "authorization") {
            headers.set(name, request.headers.get(name) || "");
          }
        }

        try {
          const res = await fetch(target, {
            method: "POST",
            headers,
            body: rawBody,
          });
          const text = await res.text();
          return new Response(text, {
            status: res.status,
            headers: {
              "content-type": res.headers.get("content-type") || "application/json",
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Forward failed";
          console.error("[webhooks/recall] forward to Notetaker failed:", message);
          return Response.json({ ok: false, error: message }, { status: 502 });
        }
      },
    },
  },
});
