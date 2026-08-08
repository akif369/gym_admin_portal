import { eq, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env';
import { db } from '../../db/index';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { organizations, users, branches, roles, settings, members } from '../../db/schema/index';
import type { FastifyInstance } from 'fastify';

export async function superAdminLogin(fastify: FastifyInstance, payload: any) {
  const { email, password } = payload;
  
  if (
    email !== config.superAdmin.email ||
    password !== config.superAdmin.password
  ) {
    throw AppError.unauthorized(ErrorCode.UNAUTHORIZED, 'Invalid admin credentials');
  }

  // Create a dummy session ID since we don't track super admin sessions in the DB right now
  const sessionId = uuidv4();

  // Sign access token
  const accessToken = fastify.jwt.sign({
    userId: 'super-admin',
    email: config.superAdmin.email,
    role: 'SUPER_ADMIN',
    orgId: 'system',
    sessionId,
  });

  return { accessToken, user: { email, role: 'SUPER_ADMIN' } };
}

export async function getAdminStats() {
  const orgCount = await db.select({ count: sql<number>`count(*)::int` }).from(organizations);
  const userCount = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const memberCount = await db.select({ count: sql<number>`count(*)::int` }).from(members);
  
  return {
    totalOrganizations: orgCount[0].count,
    totalUsers: userCount[0].count,
    totalMembers: memberCount[0].count,
  };
}

export async function listOrganizations() {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      email: organizations.email,
      phone: organizations.phone,
      status: organizations.status,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(sql`${organizations.createdAt} DESC`);
}

export async function updateOrganizationStatus(orgId: string, status: 'ACTIVE' | 'SUSPENDED') {
  const [org] = await db
    .update(organizations)
    .set({ status, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
    
  if (!org) {
    throw AppError.notFound(ErrorCode.RESOURCE_NOT_FOUND, 'Organization not found');
  }
  return org;
}
