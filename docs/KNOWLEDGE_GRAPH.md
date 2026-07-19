# Alyson Knowledge Graph (branch: `knowledge-graph`)

Local Neo4j graph for **@cintara.ai** people, meetings, projects, tasks, and (planned) Gmail / Drive / Chat activity. DeepSeek extracts entities and relationships from meeting notes + transcripts already in S3.

> This work lives on the **`knowledge-graph`** branch so `main` production flows stay unchanged. Sync is **off by default** (`KNOWLEDGE_GRAPH_ENABLED=false`).

## Architecture

```
Google DWD (admin) ──► Unified meetings + Workspace Activity (existing)
Recall bot joins @cintara.ai meetings
       │
       ▼
Notetaker upstream (live lines) → S3 bot-index / transcripts / notes
       │
       ▼  (flagged) /api/cron/knowledge-graph-sync
DeepSeek mapMeetingToKnowledgeGraph
       │
       ▼
Neo4j (Docker local)  Person / Meeting / Project / Task / Topic / Document / Email / ChatMessage
```

## Quick start (local)

```bash
# 1) Start Neo4j
cd docker/neo4j
docker compose up -d
# Browser: http://localhost:7474  user neo4j / password password

# 2) .env (on knowledge-graph branch only)
KNOWLEDGE_GRAPH_ENABLED=true
KNOWLEDGE_GRAPH_COMPANY_DOMAIN=cintara.ai
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
DEEPSEEK_API_KEY=...

# 3) Bootstrap schema + sync a few meetings
npm run kg:schema
npm run kg:sync
```

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run kg:up` | `docker compose up -d` for Neo4j |
| `npm run kg:down` | Stop Neo4j |
| `npm run kg:schema` | Create constraints/indexes |
| `npm run kg:sync` | Sync up to N ready meetings from S3 via DeepSeek → Neo4j |
| `npm run kg:status` | Connectivity + node counts |

## Cron

- Route: `GET|POST /api/cron/knowledge-graph-sync`
- Auth: same Bearer as notetaker transcript cron (`NOTETAKER_TRANSCRIPT_CRON_SECRET` / `CRON_SECRET`)
- No-ops when `KNOWLEDGE_GRAPH_ENABLED=false`

Optional: add to `vercel.json` later — **do not enable on production main until Neo4j Aura (or similar) is provisioned**. Local Docker cannot be reached from Vercel.

## Graph model

| Node | Key | Source (phase 1) |
|------|-----|------------------|
| Person | email | DeepSeek + ATTENDED |
| Meeting | botId | S3 bot-index |
| Project | key | DeepSeek ABOUT |
| Task | key | DeepSeek + HAS_TASK |
| Topic | key | DeepSeek |
| Document | driveId | stub (DWD Drive next) |
| Email | messageId | stub (DWD Gmail next) |
| ChatMessage | messageId | stub (DWD Chat next) |

### Useful Cypher (Neo4j Browser)

```cypher
// Meetings for a user in a day range
MATCH (p:Person {email:'thirumalai@cintara.ai'})-[:ATTENDED]->(m:Meeting)
WHERE m.meetingDay >= '2026-07-01' AND m.meetingDay <= '2026-07-31'
RETURN m.title, m.meetingDay, m.botId
ORDER BY m.meetingDay DESC

// Projects inferred from their meetings
MATCH (p:Person {email:'thirumalai@cintara.ai'})-[:ATTENDED]->(:Meeting)-[:ABOUT]->(proj:Project)
RETURN proj.name, count(*) AS meetings
ORDER BY meetings DESC
```

## Phase roadmap

1. **Done (this branch):** Docker Neo4j, schema, DeepSeek meeting mapper, S3 sync, queries, cron route (flagged off), Workspace ingest stubs.
2. **Next:** Wire Workspace Activity Gmail/Drive/Chat readers into upsert helpers; schedule per-user `@cintara.ai` backfill.
3. **Later:** UI explorer, Neo4j Aura for hosted, GraphRAG for “what project is X on?”.

## Safety

- Does not alter Recall bot dispatch, S3 transcript persist, or notes email paths when disabled.
- Bot-index only gains optional `kgSynced*` markers after a successful sync.
- Keep changes on `knowledge-graph` until reviewed; merge to `main` only when ready.
