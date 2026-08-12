import { knowledgeGraphCompanyDomain, normalizeEmail } from "@/lib/knowledge-graph/kg-config.server";
import { withNeo4jSession } from "@/lib/knowledge-graph/kg-neo4j.server";
import neo4j from "neo4j-driver";

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
        limit: neo4j.int(limit),
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
      { email: normalized, limit: neo4j.int(limit) },
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
    // Sequential runs — Neo4j sessions cannot run concurrent `session.run` (Promise.all fails).
    const people = await session.run(
      `MATCH (p:Person) WHERE p.domain = $domain RETURN count(p) AS n`,
      { domain },
    );
    const meetings = await session.run(`MATCH (m:Meeting) RETURN count(m) AS n`);
    const projects = await session.run(`MATCH (p:Project) RETURN count(p) AS n`);
    const tasks = await session.run(`MATCH (t:Task) RETURN count(t) AS n`);
    const topics = await session.run(`MATCH (t:Topic) RETURN count(t) AS n`);
    const attended = await session.run(`MATCH ()-[r:ATTENDED]->() RETURN count(r) AS n`);
    return {
      domain,
      people: Number(people.records[0]?.get("n") || 0),
      meetings: Number(meetings.records[0]?.get("n") || 0),
      projects: Number(projects.records[0]?.get("n") || 0),
      tasks: Number(tasks.records[0]?.get("n") || 0),
      topics: Number(topics.records[0]?.get("n") || 0),
      attendedEdges: Number(attended.records[0]?.get("n") || 0),
    };
  });
}

export async function queryTopPeople(limit = 20) {
  const domain = knowledgeGraphCompanyDomain();
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (p:Person)-[:ATTENDED]->(m:Meeting)
      WHERE p.domain = $domain
      RETURN p.email AS email, p.name AS name, count(m) AS meetingCount
      ORDER BY meetingCount DESC
      LIMIT $limit
      `,
      { domain, limit: neo4j.int(limit) },
    );
    return result.records.map((rec) => ({
      email: String(rec.get("email") || ""),
      name: String(rec.get("name") || "") || undefined,
      meetingCount: Number(rec.get("meetingCount") || 0),
    }));
  });
}

export async function queryTopProjects(limit = 20) {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (m:Meeting)-[:ABOUT]->(p:Project)
      RETURN p.key AS key, p.name AS name, count(m) AS meetingCount
      ORDER BY meetingCount DESC
      LIMIT $limit
      `,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((rec) => ({
      key: String(rec.get("key") || ""),
      name: String(rec.get("name") || ""),
      meetingCount: Number(rec.get("meetingCount") || 0),
    }));
  });
}

export async function queryTopTopics(limit = 20) {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (m:Meeting)-[:ABOUT|RELATED_TO]->(t:Topic)
      RETURN t.key AS key, t.name AS name, count(DISTINCT m) AS meetingCount
      ORDER BY meetingCount DESC
      LIMIT $limit
      `,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((rec) => ({
      key: String(rec.get("key") || ""),
      name: String(rec.get("name") || ""),
      meetingCount: Number(rec.get("meetingCount") || 0),
    }));
  });
}

export async function queryRecentMeetings(limit = 25) {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (m:Meeting)
      OPTIONAL MATCH (p:Person)-[:ATTENDED]->(m)
      RETURN m.botId AS botId,
             m.title AS title,
             m.meetingDay AS meetingDay,
             count(DISTINCT p) AS attendees
      ORDER BY coalesce(m.meetingDay, '') DESC
      LIMIT $limit
      `,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((rec) => ({
      botId: String(rec.get("botId") || ""),
      title: String(rec.get("title") || ""),
      meetingDay: (rec.get("meetingDay") as string | null) ?? null,
      attendees: Number(rec.get("attendees") || 0),
    }));
  });
}

/** Neighborhood for graph explorer UI. */
export async function queryMeetingNeighborhood(botId: string, limit = 40) {
  const id = String(botId || "").trim();
  if (!id) return { meeting: null as null | { botId: string; title: string; meetingDay?: string | null }, nodes: [], edges: [] };

  return withNeo4jSession(async (session) => {
    const meetingRes = await session.run(
      `
      MATCH (m:Meeting {botId: $botId})
      RETURN m.botId AS botId, m.title AS title, m.meetingDay AS meetingDay
      `,
      { botId: id },
    );
    const mRec = meetingRes.records[0];
    if (!mRec) return { meeting: null, nodes: [], edges: [] };

    const meeting = {
      botId: String(mRec.get("botId") || ""),
      title: String(mRec.get("title") || ""),
      meetingDay: (mRec.get("meetingDay") as string | null) ?? null,
    };

    const neigh = await session.run(
      `
      MATCH (m:Meeting {botId: $botId})
      OPTIONAL MATCH (person:Person)-[a:ATTENDED]->(m)
      OPTIONAL MATCH (m)-[about:ABOUT]->(project:Project)
      OPTIONAL MATCH (m)-[:HAS_TASK]->(task:Task)
      OPTIONAL MATCH (m)-[:ABOUT|RELATED_TO]->(topic:Topic)
      WITH m,
           collect(DISTINCT {kind:'Person', key: person.email, label: coalesce(person.name, person.email), rel:'ATTENDED'}) AS people,
           collect(DISTINCT {kind:'Project', key: project.key, label: project.name, rel:'ABOUT'}) AS projects,
           collect(DISTINCT {kind:'Task', key: task.key, label: task.text, rel:'HAS_TASK'}) AS tasks,
           collect(DISTINCT {kind:'Topic', key: topic.key, label: topic.name, rel:'ABOUT'}) AS topics
      RETURN people, projects, tasks, topics
      `,
      { botId: id },
    );

    const row = neigh.records[0];
    const buckets = ["people", "projects", "tasks", "topics"] as const;
    const nodes: Array<{ id: string; kind: string; label: string }> = [
      { id: `Meeting:${meeting.botId}`, kind: "Meeting", label: meeting.title },
    ];
    const edges: Array<{ id: string; source: string; target: string; label: string }> = [];

    for (const bucket of buckets) {
      const items = (row?.get(bucket) as Array<Record<string, unknown>> | undefined) ?? [];
      for (const item of items.slice(0, limit)) {
        const key = String(item.key || "").trim();
        const kind = String(item.kind || "").trim();
        if (!key || !kind || key === "null") continue;
        const nodeId = `${kind}:${key}`;
        if (!nodes.some((n) => n.id === nodeId)) {
          nodes.push({
            id: nodeId,
            kind,
            label: String(item.label || key).slice(0, 80),
          });
        }
        const rel = String(item.rel || "RELATED");
        const edgeId = `${nodeId}->${meeting.botId}:${rel}`;
        if (kind === "Person") {
          edges.push({ id: edgeId, source: nodeId, target: `Meeting:${meeting.botId}`, label: rel });
        } else {
          edges.push({ id: edgeId, source: `Meeting:${meeting.botId}`, target: nodeId, label: rel });
        }
      }
    }

    return { meeting, nodes, edges };
  });
}

export async function queryOverviewInsights() {
  // Sequential sessions — safer than Promise.all against a single Neo4j on Windows/Docker.
  const summary = await queryGraphSummary();
  const topPeople = await queryTopPeople(15);
  const topProjects = await queryTopProjects(15);
  const topTopics = await queryTopTopics(12);
  const recentMeetings = await queryRecentMeetings(20);
  return { summary, topPeople, topProjects, topTopics, recentMeetings };
}
