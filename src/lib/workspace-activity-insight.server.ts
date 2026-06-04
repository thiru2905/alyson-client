import { groqChat, groqModel } from "@/lib/groq-chat.server";

const MAX_CONTENT_CHARS = 6000;

export type WorkspaceActivityInsightResult = {
  summary: string;
  model: string;
};

export async function summarizeWorkspaceActivityItem(data: {
  kind: "doc" | "email" | "chat";
  title: string;
  preview: string;
  at: string;
  userEmail: string;
  rangeLabel?: string;
}): Promise<WorkspaceActivityInsightResult> {
  const excerpt = (data.preview || data.title || "").trim().slice(0, MAX_CONTENT_CHARS);
  if (!excerpt || excerpt.length < 8) {
    const emptyHint =
      data.kind === "doc"
        ? "Not enough document text to summarize. Open the file in Google Docs or widen the date range."
        : data.kind === "email"
          ? "Not enough email text to summarize. Enable Gmail API delegation for body preview, or widen the date range."
          : "Not enough chat message text to summarize. Configure the Chat API app in GCP or widen the date range.";
    return { summary: emptyHint, model: groqModel() };
  }

  const kindLabel = data.kind === "doc" ? "Google Doc" : data.kind === "email" ? "email" : "chat message";
  const replyShape =
    data.kind === "email"
      ? [
          "Reply with:",
          "1) One sentence: purpose of the email.",
          "2) 2-4 bullets: key points, asks, or next steps (only if in the text).",
          "3) One short line: tone or urgency if evident.",
          "Stay under 130 words total.",
        ]
      : data.kind === "chat"
        ? [
            "Reply with:",
            "1) One sentence: what was said or asked.",
            "2) 2-4 bullets: main points or decisions (only if in the text).",
            "3) One short line: context (room/topic) if clear.",
            "Stay under 130 words total.",
          ]
        : [
            "Reply with:",
            "1) One sentence: what this is about.",
            "2) 2-4 bullets: main topics, purpose, or actions (only if supported by text).",
            "3) One short line: why it might matter in the selected time period.",
            "Stay under 130 words total.",
          ];

  const summary = await groqChat(
    [
      {
        role: "system",
        content: [
          "You help managers quickly understand Workspace activity.",
          "Write plain English. No markdown headers. Use short bullets if helpful.",
          "Only use facts from the excerpt. Do not invent people, dates, or commitments not in the text.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Summarize this ${kindLabel} for a busy reviewer.`,
          `Employee: ${data.userEmail}`,
          `Created/sent (ISO): ${data.at}`,
          data.rangeLabel ? `Report window: ${data.rangeLabel}` : "",
          data.kind === "email" ? `Subject: ${data.title}` : `Title: ${data.title}`,
          "",
          "Content excerpt:",
          excerpt,
          "",
          ...replyShape,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    0.25,
  );

  return {
    summary: summary || "No summary generated.",
    model: groqModel(),
  };
}
