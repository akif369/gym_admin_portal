import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS platform_admins CASCADE;`);
    await db.execute(sql`DROP TYPE IF EXISTS platform_admin_role CASCADE;`);
    await db.execute(sql`DROP TYPE IF EXISTS platform_admin_status CASCADE;`);
    console.log('Successfully dropped platform admin types and tables');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
main();
