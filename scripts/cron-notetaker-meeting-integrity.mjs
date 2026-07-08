/**
 * Run meeting calendar integrity audit/repair against the deployed app.
 * Usage: dotenv -e .env -- npm run cron:notetaker-meeting-integrity
 */
const base = (process.env.ALYSON_APP_BASE_URL || process.env.VERCEL_URL || "http://localhost:3001")
  .replace(/\/$/, "")
  .replace(/^([^h])/, "https://$1");
const secret =
  process.env.NOTETAKER_TRANSCRIPT_CRON_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  "";

const headers = { Accept: "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const res = await fetch(`${base}/api/cron/notetaker-meeting-integrity?repair=true`, {
  method: "POST",
  headers,
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
