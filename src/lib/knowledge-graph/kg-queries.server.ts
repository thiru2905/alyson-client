import { knowledgeGraphCompanyDomain, normalizeEmail } from "@/lib/knowledge-graph/kg-config.server";
import { withNeo4jSession } from "@/lib/knowledge-graph/kg-neo4j.server";

export type PersonMeetingStats = {
  email: string;
  name?: string;
  meetingCount: number;
  fromDay?: string | null;
  toDay?: string | null;
  meetings: Array<{ botId: string; title: string; meetingDay?: string | null }>;
};

/** Meetings a company person attended in an optional day range (YYYY-MM-DD). */
export async function queryPersonMeetings(args: {
  email: string;
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PersonMeetingStats> {
  const email = normalizeEmail(args.email);
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (p:Person {email: $email})-[r:ATTENDED]->(m:Meeting)
      WHERE ($fromDay IS NULL OR m.meetingDay >= $fromDay)
        AND ($toDay IS NULL OR m.meetingDay <= $toDay)
      RETURN p.name AS name,
             m.botId AS botId,
             m.title AS title,
             m.meetingDay AS meetingDay
      ORDER BY coalesce(m.meetingDay, '') DESC
      LIMIT $limit
      `,
      {
        email,
        fromDay: args.fromDay ?? null,
        toDay: args.toDay ?? null,
        limit,
      },
    );

    const meetings = result.records.map((rec) => ({
      botId: String(rec.get("botId") || ""),
      title: String(rec.get("title") || ""),
      meetingDay: (rec.get("meetingDay") as string | null) ?? null,
    }));

    return {
      email,
      name: result.records[0] ? String(result.records[0].get("name") || "") || undefined : undefined,
      meetingCount: meetings.length,
      fromDay: args.fromDay ?? null,
      toDay: args.toDay ?? null,
      meetings,
    };
  });
}

export async function queryPersonProjects(email: string, limit = 30) {
  const normalized = normalizeEmail(email);
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (p:Person {email: $email})-[:ATTENDED]->(m:Meeting)-[:ABOUT]->(proj:Project)
      RETURN proj.key AS key, proj.name AS name, count(m) AS meetingCount
      ORDER BY meetingCount DESC
      LIMIT $limit
      `,
      { email: normalized, limit },
    );
    return result.records.map((rec) => ({
      key: String(rec.get("key") || ""),
      name: String(rec.get("name") || ""),
      meetingCount: Number(rec.get("meetingCount") || 0),
    }));
  });
}

export async function queryGraphSummary() {
  return withNeo4jSession(async (session) => {
    const domain = knowledgeGraphCompanyDomain();
    const [people, meetings, projects, tasks, topics] = await Promise.all([
      session.run(`MATCH (p:Person) WHERE p.domain = $domain RETURN count(p) AS n`, { domain }),
      session.run(`MATCH (m:Meeting) RETURN count(m) AS n`),
      session.run(`MATCH (p:Project) RETURN count(p) AS n`),
      session.run(`MATCH (t:Task) RETURN count(t) AS n`),
      session.run(`MATCH (t:Topic) RETURN count(t) AS n`),
    ]);
    return {
      domain,
      people: Number(people.records[0]?.get("n") || 0),
      meetings: Number(meetings.records[0]?.get("n") || 0),
      projects: Number(projects.records[0]?.get("n") || 0),
      tasks: Number(tasks.records[0]?.get("n") || 0),
      topics: Number(topics.records[0]?.get("n") || 0),
    };
  });
}
