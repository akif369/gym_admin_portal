/**
 * Database migration runner
 * Runs Drizzle migrations programmatically
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as path from 'path';
import { createLogger } from '../common/logger/index';

const log = createLogger('migrate');

async function runMigrations() {
  log.info('Starting database migrations...');

  const sql = postgres(process.env['DATABASE_URL']!, {
    max: 1, // Use single connection for migrations
  });

  const db = drizzle(sql);

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, 'migrations'),
    });
    log.info('✅ Migrations completed successfully');
  } catch (err) {
    log.error({ err }, '❌ Migration failed');
    throw err;
  } finally {
    await sql.end();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
