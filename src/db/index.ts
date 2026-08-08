import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';
import { config } from '../config/env';
import { logger } from '../common/logger/index';

// ── Connection Pool ────────────────────────────────────────────────────────────

let sql: ReturnType<typeof postgres>;

const getConnection = () => {
  if (!sql) {
    sql = postgres(config.databaseUrl, {
      max: config.isProduction ? 20 : 5,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false, // Required for some PgBouncer setups
      onnotice: (notice) => {
        logger.debug({ notice }, 'PostgreSQL notice');
      },
    });
    logger.info('PostgreSQL connection pool initialized');
  }
  return sql;
};

// ── Drizzle Instance ──────────────────────────────────────────────────────────

export const db = drizzle(getConnection(), {
  schema,
  logger: config.isDevelopment
    ? {
        logQuery: (query: string, params: unknown[]) => {
          logger.debug({ query, params }, 'SQL query');
        },
      }
    : false,
});

// ── Health Check ──────────────────────────────────────────────────────────────

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await getConnection()`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return false;
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

export async function closeDatabaseConnection(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    logger.info('PostgreSQL connection pool closed');
  }
}

export { schema };
