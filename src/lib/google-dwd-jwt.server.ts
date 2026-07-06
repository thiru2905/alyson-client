import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/** Domain-wide delegation JWT — same pattern as Workspace Activity / Unified Meetings. */
export async function loadGoogleDwdJwt(subject: string, scopes: string[]): Promise<JWT> {
  let parsed: { client_email?: string; private_key?: string } | null = null;
  const inlineJson = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    try {
      parsed = JSON.parse(inlineJson) as { client_email?: string; private_key?: string };
    } catch {
      throw new Error("Invalid GOOGLE_DWD_SERVICE_ACCOUNT_JSON (must be valid JSON)");
    }
  } else {
    const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
    const txt = await fs.readFile(credentialsPath, "utf8");
    parsed = JSON.parse(txt) as { client_email?: string; private_key?: string };
  }

  const clientEmail = parsed.client_email || env("GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL");
  const privateKey = parsed.private_key;
  if (!privateKey) {
    throw new Error("Failed to load private_key from GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS");
  }

  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject,
  });
}

export function googleDwdConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}
