import * as dotenv from 'dotenv';
dotenv.config();
import { db } from './index';
import { sql } from 'drizzle-orm';

async function reset() {
  console.log('Dropping all tables...');
  await db.execute(sql`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('Done!');
  process.exit(0);
}

reset().catch(e => {
  console.error(e);
  process.exit(1);
});
