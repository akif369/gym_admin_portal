import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '../db/index';
import { platformAdmins } from '../db/schema/index';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { createLogger } from '../common/logger/index';
import { Error } from 'postgres';

const log = createLogger('admin-bootstrap');

async function bootstrap() {
  log.info('Starting Platform Admin Bootstrap...');

  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    log.error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be provided in the environment variables.');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // Check if any platform admin already exists
    const existingAdmins = await db.select().from(platformAdmins).limit(1);

    if (existingAdmins.length > 0) {
      log.info('A platform administrator already exists.');
      log.info('Bootstrap skipped. No changes were made.');
      process.exit(0);
    }

    log.info(`Creating initial SUPER_ADMIN account for ${normalizedEmail}...`);

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await db.insert(platformAdmins).values({
      email: normalizedEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    log.info('✓ Database connection successful');
    log.info('✓ Admin created');
    log.info('✓ Password securely hashed (Argon2id)');
    log.info('Bootstrap completed successfully.');
    
    process.exit(0);
  } catch (error: unknown) {
    log.error(error as Error, 'Bootstrap failed:');
    process.exit(1);
  }
}

bootstrap();
