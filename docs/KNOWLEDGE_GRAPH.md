# Alyson Knowledge Graph

Local Neo4j graph for **@cintara.ai** people, meetings, projects, tasks, and topics — built from the ~450 Notetaker meetings already in S3. DeepSeek extracts entities; the Alyson HR UI explores the graph.

> Sync is **off by default** (`KNOWLEDGE_GRAPH_ENABLED=false`) so production stays untouched until Neo4j is running.

## Architecture

```
Notetaker S3 (bot-index / transcripts / notes)
       │
       ▼  npm run kg:sync  |  UI "Sync meetings"  |  cron (flagged)
DeepSeek mapMeetingToKnowledgeGraph
       │
       ▼
Neo4j (Docker)  Person / Meeting / Project / Task / Topic
       │
       ▼
Alyson HR → Ops → Knowledge Graph  (/alyson-notetaker/knowledge-graph)
```

## Quick start (local)

```bash
# 1) Start Neo4j
npm run kg:up
# Browser: http://localhost:7474  user neo4j / password password

# 2) .env
KNOWLEDGE_GRAPH_ENABLED=true
KNOWLEDGE_GRAPH_COMPANY_DOMAIN=cintara.ai
NEO4J_URI=bolt://127.0.0.1:7688
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
DEEPSEEK_API_KEY=...
# optional batch size (default 25, max 500)
KNOWLEDGE_GRAPH_MAX_MEETINGS_PER_RUN=50

# 3) Schema + sync (repeat sync until ~450 meetings are loaded)
npm run kg:schema
npm run kg:sync 50
npm run kg:status
```

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run kg:up` | Start Neo4j Docker |
| `npm run kg:down` | Stop Neo4j |
| `npm run kg:schema` | Create constraints/indexes |
| `npm run kg:sync [N]` | Sync up to N ready meetings from S3 |
| `npm run kg:status` | Connectivity + node counts |

## UI

**Ops → Knowledge Graph** shows:

- Overall counts (people, meetings, projects, topics, tasks)
- Top people / projects / topics
- Recent meetings → interactive neighborhood graph (React Flow)
- Person email search → meetings attended + inferred projects
- Schema bootstrap + batch sync controls

## Graph model

| Node | Key | Source |
|------|-----|--------|
| Person | email | DeepSeek + ATTENDED |
| Meeting | botId | S3 bot-index |
| Project | key | DeepSeek ABOUT |
| Task | key | DeepSeek + HAS_TASK |
| Topic | key | DeepSeek |

## Cron

- Route: `GET|POST /api/cron/knowledge-graph-sync`
- Also hooked into notetaker transcript cron when `KNOWLEDGE_GRAPH_ENABLED=true`
- Auth: Bearer `NOTETAKER_TRANSCRIPT_CRON_SECRET` / `CRON_SECRET`

**Production:** use Neo4j Aura (or similar). Local Docker is not reachable from Vercel.

## Safety

- Disabled unless `KNOWLEDGE_GRAPH_ENABLED=true`
- Does not change Recall bot dispatch or notes email paths
- Bot-index only gains optional `kgSynced*` markers after a successful sync
