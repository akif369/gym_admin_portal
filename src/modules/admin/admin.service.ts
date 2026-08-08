import { eq, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env';
import { db } from '../../db/index';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { organizations, users, branches, roles, settings, members, paymentTransactions, staffAuditLogs } from '../../db/schema/index';
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
  const [orgCount] = await db.select({ count: sql<number>`count(*)` }).from(organizations);
  const [memberCount] = await db.select({ count: sql<number>`count(*)` }).from(members);
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  
  const [revenue] = await db.select({ 
    total: sql<number>`COALESCE(SUM(${paymentTransactions.totalAmount}), 0)` 
  }).from(paymentTransactions);

  return {
    totalOrganizations: Number(orgCount?.count) || 0,
    totalMembers: Number(memberCount?.count) || 0,
    totalUsers: Number(userCount?.count) || 0,
    totalPlatformRevenue: Number(revenue?.total) || 0,
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

export async function getOrganizationBranches(orgId: string) {
  return db
    .select({
      id: branches.id,
      name: branches.name,
      address: branches.address,
      city: branches.city,
      status: branches.status,
      capacity: branches.capacity,
      isMainBranch: branches.isMainBranch,
    })
    .from(branches)
    .where(eq(branches.organizationId, orgId))
    .orderBy(sql`${branches.createdAt} ASC`);
}

export async function resetOrganizationOwnerPassword(orgId: string, newPassword: string) {
  // Find the user with role OWNER for this org
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.organizationId} = ${orgId} AND ${users.role} = 'OWNER'`)
    .limit(1);

  if (!owner) {
    throw AppError.notFound(ErrorCode.RESOURCE_NOT_FOUND, 'No OWNER user found for this organization');
  }

  const hashedPassword = await argon2.hash(newPassword);

  await db
    .update(users)
    .set({ passwordHash: hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, owner.id));

  return { success: true };
}

export async function createOrganization(payload: any) {
  const { orgName, orgEmail, branchName, city, ownerFirstName, ownerLastName, ownerEmail, ownerPassword } = payload;
  
  // Transaction to ensure atomicity
  return await db.transaction(async (tx) => {
    // 1. Create Organization
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    const [newOrg] = await tx.insert(organizations).values({
      name: orgName,
      slug,
      email: orgEmail,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    }).returning();

    // 2. Create Main Branch
    const [newBranch] = await tx.insert(branches).values({
      organizationId: newOrg.id,
      name: branchName,
      city,
      isMainBranch: true,
    }).returning();

    // 3. Create Owner User
    const hashedPassword = await argon2.hash(ownerPassword);
    const [newOwner] = await tx.insert(users).values({
      organizationId: newOrg.id,
      branchId: newBranch.id,
      email: ownerEmail,
      passwordHash: hashedPassword,
      role: 'OWNER',
      firstName: ownerFirstName,
      lastName: ownerLastName,
    }).returning();

    return {
      organization: newOrg,
      branch: newBranch,
      owner: { id: newOwner.id, email: newOwner.email, role: newOwner.role }
    };
  });
}

export async function getGlobalAuditLogs() {
  return await db
    .select({
      id: staffAuditLogs.id,
      organizationId: staffAuditLogs.organizationId,
      organizationName: organizations.name,
      actorEmail: staffAuditLogs.actorEmail,
      actorRole: staffAuditLogs.actorRole,
      entityType: staffAuditLogs.entityType,
      action: staffAuditLogs.action,
      description: staffAuditLogs.description,
      createdAt: staffAuditLogs.createdAt,
    })
    .from(staffAuditLogs)
    .leftJoin(organizations, eq(staffAuditLogs.organizationId, organizations.id))
    .orderBy(sql`${staffAuditLogs.createdAt} DESC`)
    .limit(100);
}
