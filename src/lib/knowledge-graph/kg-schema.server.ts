import { withNeo4jSession } from "@/lib/knowledge-graph/kg-neo4j.server";

/** Idempotent constraints / indexes for Alyson KG. */
export async function ensureKnowledgeGraphSchema(): Promise<{ applied: string[] }> {
  const statements = [
    "CREATE CONSTRAINT person_email IF NOT EXISTS FOR (p:Person) REQUIRE p.email IS UNIQUE",
    "CREATE CONSTRAINT meeting_bot_id IF NOT EXISTS FOR (m:Meeting) REQUIRE m.botId IS UNIQUE",
    "CREATE CONSTRAINT project_key IF NOT EXISTS FOR (p:Project) REQUIRE p.key IS UNIQUE",
    "CREATE CONSTRAINT task_key IF NOT EXISTS FOR (t:Task) REQUIRE t.key IS UNIQUE",
    "CREATE CONSTRAINT topic_key IF NOT EXISTS FOR (t:Topic) REQUIRE t.key IS UNIQUE",
    "CREATE CONSTRAINT document_drive_id IF NOT EXISTS FOR (d:Document) REQUIRE d.driveId IS UNIQUE",
    "CREATE CONSTRAINT email_message_id IF NOT EXISTS FOR (e:Email) REQUIRE e.messageId IS UNIQUE",
    "CREATE CONSTRAINT chat_message_id IF NOT EXISTS FOR (c:ChatMessage) REQUIRE c.messageId IS UNIQUE",
    "CREATE INDEX person_domain IF NOT EXISTS FOR (p:Person) ON (p.domain)",
    "CREATE INDEX meeting_day IF NOT EXISTS FOR (m:Meeting) ON (m.meetingDay)",
  ];

  const applied: string[] = [];
  await withNeo4jSession(async (session) => {
    for (const cypher of statements) {
      await session.run(cypher);
      applied.push(cypher.split(" IF NOT EXISTS")[0] || cypher);
    }
  });
  return { applied };
}
