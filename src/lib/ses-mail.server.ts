import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

function optionalEnvAlias(primary: string, aliases: string[]) {
  const direct = process.env[primary]?.trim();
  if (direct) return direct;
  for (const key of aliases) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = optionalEnvAlias(primary, aliases);
  if (!v) throw new Error(`Missing ${primary}`);
  return v;
}

export function sesConfigured(): boolean {
  return Boolean(
    optionalEnvAlias("AWS_ACCESS_KEY_ID", []) &&
      optionalEnvAlias("AWS_SECRET_ACCESS_KEY", []) &&
      getSesFromAddress(),
  );
}

export function getSesRegion(): string {
  return (
    process.env.SES_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.S3_REGION?.trim() ||
    "us-west-2"
  );
}

export function getSesFromAddress(): string {
  const email =
    process.env.SES_FROM_EMAIL?.trim() ||
    process.env.NOTETAKER_FROM_EMAIL?.trim() ||
    "notetaker@cintara.ai";
  const name = process.env.SES_FROM_NAME?.trim() || process.env.NOTETAKER_FROM_NAME?.trim() || "Alyson Notetaker";
  if (email.includes("<")) return email;
  return `${name} <${email}>`;
}

function getSesClient(): SESClient {
  return new SESClient({
    region: getSesRegion(),
    credentials: {
      accessKeyId: requireEnvAlias("AWS_ACCESS_KEY_ID", []),
      secretAccessKey: requireEnvAlias("AWS_SECRET_ACCESS_KEY", []),
    },
  });
}

export async function sendSesEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string[];
}) {
  const to = [...new Set(args.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) throw new Error("No recipients configured");

  const client = getSesClient();
  const { MessageId } = await client.send(
    new SendEmailCommand({
      Source: getSesFromAddress(),
      Destination: { ToAddresses: to },
      ReplyToAddresses: args.replyTo?.length ? args.replyTo : undefined,
      Message: {
        Subject: { Data: args.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: args.html, Charset: "UTF-8" },
          Text: { Data: args.text || stripHtml(args.html), Charset: "UTF-8" },
        },
      },
    }),
  );

  return { messageId: MessageId, recipients: to };
}

function stripHtml(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
