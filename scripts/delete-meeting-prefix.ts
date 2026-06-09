import { deletePersistedMeetingFromS3ByPrefix } from "../src/lib/notetaker-s3-delete.server";

const prefix = process.argv[2] || "meeting-test_2026-05-07_10-43-58";
console.log("Deleting S3 meeting:", prefix);
const r = await deletePersistedMeetingFromS3ByPrefix(prefix);
console.log(JSON.stringify(r, null, 2));
