import neo4j, { type Driver, type Session } from "neo4j-driver";
import {
  knowledgeGraphEnabled,
  neo4jPassword,
  neo4jUri,
  neo4jUser,
} from "@/lib/knowledge-graph/kg-config.server";

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(neo4jUri(), neo4j.auth.basic(neo4jUser(), neo4jPassword()), {
      disableLosslessIntegers: true,
    });
  }
  return driver;
}

export async function withNeo4jSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const session = getNeo4jDriver().session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export async function neo4jHealthCheck(): Promise<{
  ok: boolean;
  enabled: boolean;
  uri: string;
  error?: string;
}> {
  const enabled = knowledgeGraphEnabled();
  const uri = neo4jUri();
  try {
    await getNeo4jDriver().verifyConnectivity();
    return { ok: true, enabled, uri };
  } catch (e) {
    return {
      ok: false,
      enabled,
      uri,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function closeNeo4jDriver(): Promise<void> {
  if (!driver) return;
  await driver.close();
  driver = null;
}
