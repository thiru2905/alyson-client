import neo4j, { type Driver, type Session } from "neo4j-driver";
import {
  knowledgeGraphEnabled,
  neo4jPassword,
  neo4jUri,
  neo4jUser,
} from "@/lib/knowledge-graph/kg-config.server";

let driver: Driver | null = null;
let driverUri: string | null = null;

export function getNeo4jDriver(): Driver {
  const uri = neo4jUri();
  if (driver && driverUri !== uri) {
    void driver.close().catch(() => {});
    driver = null;
    driverUri = null;
  }
  if (!driver) {
    // Prefer 127.0.0.1 over localhost on Windows — localhost can resolve to ::1 and
    // hit WSL relay instead of Docker's IPv4 publish of Bolt.
    driver = neo4j.driver(uri, neo4j.auth.basic(neo4jUser(), neo4jPassword()), {
      disableLosslessIntegers: true,
      connectionTimeout: 8_000,
      maxConnectionLifetime: 60_000,
      connectionAcquisitionTimeout: 8_000,
      maxConnectionPoolSize: 20,
    });
    driverUri = uri;
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
    await Promise.race([
      getNeo4jDriver().verifyConnectivity(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Neo4j connectivity timeout (8s)")), 8_000),
      ),
    ]);
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
