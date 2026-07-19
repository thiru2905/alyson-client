/**
 * Future Workspace Activity → Neo4j ingest (Gmail / Drive / Chat via Google DWD).
 * Phase 1 foundation only wires meetings from Notetaker S3; this module documents
 * the next source adapters without mutating main notetaker flows.
 */

import { googleDwdConfigured } from "@/lib/google-dwd-jwt.server";
import { knowledgeGraphCompanyDomain, isCompanyEmail } from "@/lib/knowledge-graph/kg-config.server";
import { withNeo4jSession } from "@/lib/knowledge-graph/kg-neo4j.server";
import type { KgChatMessage, KgDocument, KgEmail } from "@/lib/knowledge-graph/kg-types";

export type WorkspaceIngestPlan = {
  domain: string;
  dwdConfigured: boolean;
  sources: Array<{
    id: "gmail" | "drive" | "chat" | "calendar";
    status: "planned" | "ready";
    notes: string;
  }>;
};

export function describeWorkspaceIngestPlan(): WorkspaceIngestPlan {
  return {
    domain: knowledgeGraphCompanyDomain(),
    dwdConfigured: googleDwdConfigured(),
    sources: [
      {
        id: "calendar",
        status: "ready",
        notes: "Meetings already ingested from Notetaker bot-index + DeepSeek mapping.",
      },
      {
        id: "gmail",
        status: "planned",
        notes: "Reuse workspace-activity Gmail DWD readers; upsert Email + SENT/RECEIVED edges.",
      },
      {
        id: "drive",
        status: "planned",
        notes: "Reuse Drive/Docs DWD; upsert Document + CREATED/EDITED edges for @cintara.ai users.",
      },
      {
        id: "chat",
        status: "planned",
        notes: "Reuse Chat spaces/messages DWD; upsert ChatMessage + POSTED_IN edges.",
      },
    ],
  };
}

export async function upsertDocumentNode(doc: KgDocument, ownerEmail?: string): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.run(
      `
      MERGE (d:Document {driveId: $driveId})
      SET d.title = $title,
          d.mimeType = $mimeType,
          d.url = $url,
          d.updatedAt = datetime()
      `,
      {
        driveId: doc.driveId,
        title: doc.title,
        mimeType: doc.mimeType ?? null,
        url: doc.url ?? null,
      },
    );
    if (ownerEmail && isCompanyEmail(ownerEmail)) {
      await session.run(
        `
        MATCH (p:Person {email: $email})
        MATCH (d:Document {driveId: $driveId})
        MERGE (p)-[r:CREATED]->(d)
        SET r.updatedAt = datetime()
        `,
        { email: ownerEmail.toLowerCase(), driveId: doc.driveId },
      );
    }
  });
}

export async function upsertEmailNode(email: KgEmail, fromEmail?: string): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.run(
      `
      MERGE (e:Email {messageId: $messageId})
      SET e.subject = $subject,
          e.sentAt = $sentAt,
          e.updatedAt = datetime()
      `,
      {
        messageId: email.messageId,
        subject: email.subject,
        sentAt: email.sentAt ?? null,
      },
    );
    if (fromEmail && isCompanyEmail(fromEmail)) {
      await session.run(
        `
        MATCH (p:Person {email: $email})
        MATCH (e:Email {messageId: $messageId})
        MERGE (p)-[r:SENT]->(e)
        SET r.updatedAt = datetime()
        `,
        { email: fromEmail.toLowerCase(), messageId: email.messageId },
      );
    }
  });
}

export async function upsertChatMessageNode(msg: KgChatMessage, authorEmail?: string): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.run(
      `
      MERGE (c:ChatMessage {messageId: $messageId})
      SET c.spaceName = $spaceName,
          c.preview = $preview,
          c.createdAt = $createdAt,
          c.updatedAt = datetime()
      `,
      {
        messageId: msg.messageId,
        spaceName: msg.spaceName ?? null,
        preview: msg.preview ?? null,
        createdAt: msg.createdAt ?? null,
      },
    );
    if (authorEmail && isCompanyEmail(authorEmail)) {
      await session.run(
        `
        MATCH (p:Person {email: $email})
        MATCH (c:ChatMessage {messageId: $messageId})
        MERGE (p)-[r:POSTED_IN]->(c)
        SET r.updatedAt = datetime()
        `,
        { email: authorEmail.toLowerCase(), messageId: msg.messageId },
      );
    }
  });
}
