/**
 * Probe Gmail DWD — same scopes as Workspace Activity.
 * Usage: npx dotenv-cli -e .env -- node scripts/probe-google-dwd.mjs
 */
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const json = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
const testUser = process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim();
const peopleOps = process.env.LEAVE_EMAIL_MAILBOX?.trim() || "people-ops@cintara.ai";
if (!json || !testUser) {
  console.error("Missing GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
  process.exit(1);
}

const creds = JSON.parse(json);
console.log("project_id:", creds.project_id);
console.log("client_email:", creds.client_email);
console.log("client_id:", creds.client_id);
console.log("admin user:", testUser);
console.log("people-ops filter:", peopleOps);
console.log("");

async function probe(subject, scopes, label, fn) {
  try {
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes,
      subject,
    });
    await auth.authorize();
    await fn(auth);
    console.log("OK:", label);
    return true;
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    console.log("FAIL:", label, "—", msg.slice(0, 320));
    return false;
  }
}

const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";

await probe(testUser, [gmailScope], `Gmail as admin (${testUser})`, async (auth) => {
  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.list({ userId: "me", maxResults: 1 });
});

await probe(testUser, [gmailScope], `Gmail to people-ops (delegated)`, async (auth) => {
  const gmail = google.gmail({ version: "v1", auth });
  const q = `in:anywhere (to:${peopleOps} OR cc:${peopleOps} OR deliveredto:${peopleOps} OR list:${peopleOps})`;
  const r = await gmail.users.messages.list({ userId: "me", q, maxResults: 5 });
  console.log("   sample count:", (r.data.messages ?? []).length);
});

await probe(peopleOps, [gmailScope], `Gmail impersonate mailbox (${peopleOps})`, async (auth) => {
  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.list({ userId: "me", maxResults: 1 });
});

console.log("\nIf admin OK but people-ops impersonate FAIL → use delegated_inbox (default), not impersonate_mailbox.");
console.log("If both FAIL → add gmail.readonly to Admin Console → Security → API controls → Domain-wide delegation");
console.log("  Client ID:", creds.client_id);
console.log("  Scope: https://www.googleapis.com/auth/gmail.readonly");
console.log("Done.");
