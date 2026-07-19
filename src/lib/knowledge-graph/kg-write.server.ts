import { knowledgeGraphCompanyDomain, normalizeEmail } from "@/lib/knowledge-graph/kg-config.server";
import { withNeo4jSession } from "@/lib/knowledge-graph/kg-neo4j.server";
import type {
  KgExtractedGraph,
  KgMeeting,
  KgPerson,
  KgProject,
  KgTask,
  KgTopic,
} from "@/lib/knowledge-graph/kg-types";

function personDomain(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(at + 1) : knowledgeGraphCompanyDomain();
}

export async function upsertMeetingNode(meeting: KgMeeting): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.run(
      `
      MERGE (m:Meeting {botId: $botId})
      SET m.title = $title,
          m.startedAt = $startedAt,
          m.meetingDay = $meetingDay,
          m.prefix = $prefix,
          m.transcriptHash = $transcriptHash,
          m.notesHash = $notesHash,
          m.updatedAt = datetime()
      `,
      {
        botId: meeting.botId,
        title: meeting.title,
        startedAt: meeting.startedAt ?? null,
        meetingDay: meeting.meetingDay ?? null,
        prefix: meeting.prefix ?? null,
        transcriptHash: meeting.transcriptHash ?? null,
        notesHash: meeting.notesHash ?? null,
      },
    );
  });
}

export async function upsertPersonNodes(people: KgPerson[]): Promise<void> {
  if (!people.length) return;
  await withNeo4jSession(async (session) => {
    for (const p of people) {
      const email = normalizeEmail(p.email);
      if (!email) continue;
      await session.run(
        `
        MERGE (person:Person {email: $email})
        SET person.name = coalesce($name, person.name),
            person.domain = $domain,
            person.updatedAt = datetime()
        `,
        {
          email,
          name: p.name ?? null,
          domain: p.domain || personDomain(email),
        },
      );
    }
  });
}

export async function upsertProjectNodes(projects: KgProject[]): Promise<void> {
  if (!projects.length) return;
  await withNeo4jSession(async (session) => {
    for (const p of projects) {
      await session.run(
        `
        MERGE (project:Project {key: $key})
        SET project.name = $name,
            project.confidence = coalesce($confidence, project.confidence),
            project.updatedAt = datetime()
        `,
        { key: p.key, name: p.name, confidence: p.confidence ?? null },
      );
    }
  });
}

export async function upsertTaskNodes(tasks: KgTask[], meetingBotId: string): Promise<void> {
  if (!tasks.length) return;
  await withNeo4jSession(async (session) => {
    for (const t of tasks) {
      await session.run(
        `
        MERGE (task:Task {key: $key})
        SET task.text = $text,
            task.status = $status,
            task.sourceMeetingBotId = $botId,
            task.updatedAt = datetime()
        WITH task
        MATCH (m:Meeting {botId: $botId})
        MERGE (m)-[:HAS_TASK]->(task)
        `,
        { key: t.key, text: t.text, status: t.status ?? "unknown", botId: meetingBotId },
      );
    }
  });
}

export async function upsertTopicNodes(topics: KgTopic[]): Promise<void> {
  if (!topics.length) return;
  await withNeo4jSession(async (session) => {
    for (const t of topics) {
      await session.run(
        `
        MERGE (topic:Topic {key: $key})
        SET topic.name = $name,
            topic.updatedAt = datetime()
        `,
        { key: t.key, name: t.name },
      );
    }
  });
}

function mergeKeyForKind(kind: string): string {
  switch (kind) {
    case "Person":
      return "email";
    case "Meeting":
      return "botId";
    case "Project":
    case "Task":
    case "Topic":
      return "key";
    default:
      return "key";
  }
}

export async function writeExtractedRelationships(
  botId: string,
  graph: KgExtractedGraph,
): Promise<number> {
  let written = 0;
  await withNeo4jSession(async (session) => {
    for (const rel of graph.relationships) {
      const fromProp = mergeKeyForKind(rel.from.kind);
      const toProp = mergeKeyForKind(rel.to.kind);
      const fromKey = rel.from.kind === "Meeting" ? botId : rel.from.key;
      const toKey = rel.to.kind === "Meeting" ? botId : rel.to.key;
      // Relationship type is allowlisted in DeepSeek mapper — interpolate safely.
      const type = rel.type;
      const cypher = `
        MATCH (a:${rel.from.kind} {${fromProp}: $fromKey})
        MATCH (b:${rel.to.kind} {${toProp}: $toKey})
        MERGE (a)-[r:${type}]->(b)
        SET r.evidence = coalesce($evidence, r.evidence),
            r.updatedAt = datetime(),
            r.sourceBotId = $botId
      `;
      try {
        await session.run(cypher, {
          fromKey,
          toKey,
          evidence: rel.evidence ?? null,
          botId,
        });
        written += 1;
      } catch {
        // skip invalid edge combinations
      }
    }

    // Always link extracted people to the meeting as ATTENDED when present.
    for (const p of graph.people) {
      await session.run(
        `
        MATCH (person:Person {email: $email})
        MATCH (m:Meeting {botId: $botId})
        MERGE (person)-[r:ATTENDED]->(m)
        SET r.updatedAt = datetime()
        `,
        { email: normalizeEmail(p.email), botId },
      );
      written += 1;
    }

    for (const project of graph.projects) {
      await session.run(
        `
        MATCH (p:Project {key: $key})
        MATCH (m:Meeting {botId: $botId})
        MERGE (m)-[r:ABOUT]->(p)
        SET r.updatedAt = datetime()
        `,
        { key: project.key, botId },
      );
      written += 1;
    }
  });
  return written;
}

export async function applyExtractedGraph(meeting: KgMeeting, graph: KgExtractedGraph): Promise<number> {
  await upsertMeetingNode(meeting);
  await upsertPersonNodes(graph.people);
  await upsertProjectNodes(graph.projects);
  await upsertTopicNodes(graph.topics);
  await upsertTaskNodes(graph.tasks, meeting.botId);
  return writeExtractedRelationships(meeting.botId, graph);
}
