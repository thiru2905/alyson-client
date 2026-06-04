import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

function loadEnv() {
  try {
    const envText = readFileSync(".env", "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* env may already be set */
  }
}

loadEnv();

const json = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
const testUser = process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim();
if (!json || !testUser) {
  console.error("Missing GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
  process.exit(1);
}

const creds = JSON.parse(json);
console.log("project_id:", creds.project_id);
console.log("client_email:", creds.client_email);
console.log("impersonate:", testUser);
console.log("---");

const chatScopes = [
  "https://www.googleapis.com/auth/chat.messages.readonly",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
];

const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: chatScopes,
  subject: testUser,
});

const chat = google.chat({ version: "v1", auth });

try {
  const spaceResp = await chat.spaces.list({ pageSize: 10 });
  const spaces = spaceResp.data.spaces ?? [];
  console.log("spaces.list: OK");
  console.log("  spaces returned:", spaces.length);
  for (const s of spaces.slice(0, 5)) {
    console.log("  -", s.displayName || s.name, "|", s.spaceType || "", "|", s.name);
  }

  if (!spaces.length) {
    console.log("\nNo Chat spaces visible for this user. Message bodies cannot be tested.");
    process.exit(0);
  }

  let totalMsgs = 0;
  let withText = 0;
  let samplePreview = "";

  for (const space of spaces.slice(0, 3)) {
    const parent = space.name;
    if (!parent) continue;
    const list = await chat.spaces.messages.list({ parent, pageSize: 10 });
    const messages = list.data.messages ?? [];
    totalMsgs += messages.length;
    for (const msg of messages) {
      const text = String(msg.text || msg.argumentText || msg.formattedText || "").trim();
      if (text.length > 0) {
        withText += 1;
        if (!samplePreview) samplePreview = text.slice(0, 120);
      }
    }
    console.log(
      `messages.list (${space.displayName || parent}):`,
      messages.length,
      "messages",
    );
  }

  console.log("---");
  console.log("messages sampled:", totalMsgs);
  console.log("messages with readable text:", withText);
  if (samplePreview) {
    console.log("sample text:", samplePreview.replace(/\s+/g, " "));
    console.log("\nRESULT: Chat API works and message content is readable.");
  } else if (totalMsgs > 0) {
    console.log("\nRESULT: Chat API lists messages but text fields are empty (check message format).");
  } else {
    console.log("\nRESULT: Chat API works; no messages in sampled spaces.");
  }
} catch (e) {
  const msg = e?.response?.data?.error?.message || e?.message || String(e);
  console.log("FAIL:", msg);
  if (e?.response?.data) {
    console.log(JSON.stringify(e.response.data, null, 2).slice(0, 600));
  }
  console.log("\nRESULT: Chat API not accessible — configure Chat app in GCP Configuration tab.");
  process.exit(1);
}
