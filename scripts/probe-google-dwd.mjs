import { google } from "googleapis";
import { JWT } from "google-auth-library";

const json = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
const testUser = process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim();
if (!json || !testUser) {
  console.error("Missing GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
  process.exit(1);
}

const creds = JSON.parse(json);
console.log("project_id:", creds.project_id);
console.log("client_email:", creds.client_email);

async function probe(subject, scopes, label, fn) {
  try {
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes,
      subject,
    });
    await fn(auth);
    console.log("OK:", label);
    return true;
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    console.log("FAIL:", label, "—", msg.slice(0, 240));
    return false;
  }
}

const user = testUser;

await probe(user, ["https://www.googleapis.com/auth/drive.readonly"], "Drive API", async (auth) => {
  const drive = google.drive({ version: "v3", auth });
  await drive.files.list({ pageSize: 1, fields: "files(id,name)" });
});

await probe(user, ["https://www.googleapis.com/auth/gmail.readonly"], "Gmail API", async (auth) => {
  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.list({ userId: "me", maxResults: 1 });
});

await probe(user, ["https://www.googleapis.com/auth/chat.messages.readonly", "https://www.googleapis.com/auth/chat.spaces.readonly"], "Chat API", async (auth) => {
  const chat = google.chat({ version: "v1", auth });
  await chat.spaces.list({ pageSize: 1 });
});

console.log("Done.");
