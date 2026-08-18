import * as argon2 from 'argon2';
import { db } from '../../db/index';
import { users, userSessions, userPermissions, roles, staffInviteTokens, passwordResetTokens } from '../../db/schema/index';
import { staffAuditLogs } from '../../db/schema/audit.schema';
import { eq, and, isNull, ilike, desc, or, sql, count } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { DEFAULT_ROLE_PERMISSIONS } from '../../db/schema/rbac.schema';
import { createLogger } from '../../common/logger/index';
import { sendTextMessage } from '../notifications/notifications.service';
import crypto from 'crypto';
import { addDays } from 'date-fns';

const log = createLogger('staff-service');

// ── List Staff ────────────────────────────────────────────────────────────────

export async function listStaffService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const search = query['search'] as string | undefined;
  const branchId = query['branchId'] as string | undefined;

  const conditions = [
    eq(users.organizationId, orgId),
    isNull(users.deletedAt),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(users.firstName, `%${search}%`),
        ilike(users.lastName, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )!,
    );
  }

  if (branchId) {
    conditions.push(eq(users.branchId, branchId));
  }

  const whereClause = and(...conditions);

  const totalRes = await db
    .select({ total: count() })
    .from(users)
    .where(whereClause);
  const total = totalRes[0]?.total ?? 0;

  const items = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      photoUrl: users.photoUrl,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Create Staff ──────────────────────────────────────────────────────────────

export async function createStaffService(
  orgId: string,
  data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: string;
    branchId?: string;
    password: string;
  },
  actorId: string,
) {
  // Check email uniqueness
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, data.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (existing) {
    throw AppError.conflict(ErrorCode.EMAIL_ALREADY_EXISTS, 'A user with this email already exists');
  }

  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const [staff] = await db
    .insert(users)
    .values({
      organizationId: orgId,
      branchId: data.branchId,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role as any,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    });

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.STAFF_CREATED,
    entityType: 'staff',
    entityId: staff!.id,
    description: `Staff member ${data.email} created with role ${data.role}`,
  });

  log.info({ staffId: staff!.id, role: data.role }, 'Staff created');
  return staff;
}

// ── Get Staff ─────────────────────────────────────────────────────────────────

export async function getStaffService(orgId: string, staffId: string) {
  const [staff] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, staffId), eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .limit(1);

  if (!staff) throw AppError.notFound(ErrorCode.STAFF_NOT_FOUND, 'Staff member not found');

  const permissions = DEFAULT_ROLE_PERMISSIONS[staff.role] ?? [];
  return { ...staff, permissions };
}

// ── Update Staff ──────────────────────────────────────────────────────────────

export async function updateStaffService(
  orgId: string,
  staffId: string,
  data: Partial<typeof users.$inferInsert>,
  actorId: string,
) {
  const before = await getStaffService(orgId, staffId);

  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(users.id, staffId), eq(users.organizationId, orgId)))
    .returning();

  if (!updated) throw AppError.notFound(ErrorCode.STAFF_NOT_FOUND, 'Staff member not found');

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.STAFF_UPDATED,
    entityType: 'staff',
    entityId: staffId,
    beforeState: before,
    afterState: updated,
  });

  return updated;
}

// ── Update Staff Status ───────────────────────────────────────────────────────

export async function updateStaffStatusService(
  orgId: string,
  staffId: string,
  status: 'ACTIVE' | 'INACTIVE',
  actorId: string,
) {
  const [updated] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(users.id, staffId), eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .returning({ id: users.id, status: users.status });

  if (!updated) throw AppError.notFound(ErrorCode.STAFF_NOT_FOUND, 'Staff member not found');

  // If deactivated, revoke all sessions
  if (status === 'INACTIVE') {
    await db.update(userSessions).set({ revokedAt: new Date() }).where(
      and(eq(userSessions.userId, staffId), isNull(userSessions.revokedAt)),
    );
  }

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.STAFF_DEACTIVATED,
    entityType: 'staff',
    entityId: staffId,
    description: `Status changed to ${status}`,
  });

  return updated;
}

// ── Update Staff Permissions ──────────────────────────────────────────────────

export async function updateStaffPermissionsService(
  orgId: string,
  staffId: string,
  permissions: string[],
  actorId: string,
) {
  // Ensure staff belongs to org
  await getStaffService(orgId, staffId);

  // Upsert user permissions
  const existing = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, staffId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userPermissions)
      .set({ permissions, grantedBy: actorId, updatedAt: new Date() })
      .where(eq(userPermissions.userId, staffId));
  } else {
    await db.insert(userPermissions).values({
      userId: staffId,
      permissions,
      grantedBy: actorId,
    });
  }

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.PERMISSIONS_UPDATED,
    entityType: 'staff',
    entityId: staffId,
    afterState: { permissions },
  });

  return { userId: staffId, permissions };
}

// ── Get Roles ─────────────────────────────────────────────────────────────────

export async function getRolesService(orgId: string) {
  return db.select().from(roles).where(eq(roles.organizationId, orgId)).orderBy(roles.name);
}

// ── Get Audit Logs ────────────────────────────────────────────────────────────

export async function getAuditLogsService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const totalRes = await db
    .select({ total: count() })
    .from(staffAuditLogs)
    .where(eq(staffAuditLogs.organizationId, orgId));
  const total = totalRes[0]?.total ?? 0;

  const items = await db
    .select()
    .from(staffAuditLogs)
    .where(eq(staffAuditLogs.organizationId, orgId))
    .orderBy(desc(staffAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Invite Staff ──────────────────────────────────────────────────────────────

export async function inviteStaffService(
  orgId: string,
  data: { email: string; firstName: string; lastName: string; phone?: string; role: string; branchId?: string },
  actorId: string,
) {
  // Check email uniqueness
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, data.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (existing) {
    throw AppError.conflict(ErrorCode.EMAIL_ALREADY_EXISTS, 'A user with this email already exists');
  }

  // Create user with a dummy password and isInvitePending flag
  const dummyPasswordHash = await argon2.hash(crypto.randomBytes(32).toString('hex'));

  const [staff] = await db
    .insert(users)
    .values({
      organizationId: orgId,
      branchId: data.branchId,
      email: data.email.toLowerCase(),
      passwordHash: dummyPasswordHash,
      role: data.role as any,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      isInvitePending: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      role: users.role,
    });

  // Generate invite token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await argon2.hash(rawToken);

  await db.insert(staffInviteTokens).values({
    userId: staff!.id,
    tokenHash,
    expiresAt: addDays(new Date(), 7),
  });

  const inviteLink = `${process.env.PUBLIC_API_URL?.replace('/api/v1', '')}/invite/accept?token=${rawToken}&uid=${staff!.id}`;

  // Log action
  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.STAFF_CREATED,
    entityType: 'staff',
    entityId: staff!.id,
    description: `Staff invite sent to ${data.email}`,
  });

  // Send WhatsApp invite if phone is provided
  if (data.phone) {
    await sendTextMessage({
      organizationId: orgId,
      eventType: 'WELCOME',
      phone: data.phone,
      text: `Welcome to GYMatrix, ${data.firstName}! You have been invited to join the staff portal as a ${data.role}. Please set up your password here: ${inviteLink}`,
      idempotencyKey: `invite-${staff!.id}-${Date.now()}`,
    }).catch(err => log.error(err, 'Failed to send WhatsApp invite'));
  }

  return { staff, inviteLink };
}

// ── Reset Password (Admin Initiated) ──────────────────────────────────────────

export async function resetStaffPasswordService(orgId: string, staffId: string, actorId: string) {
  const [staff] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, staffId), eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .limit(1);

  if (!staff) throw AppError.notFound(ErrorCode.NOT_FOUND, 'Staff member not found');

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await argon2.hash(rawToken);

  await db.insert(passwordResetTokens).values({
    userId: staff.id,
    tokenHash,
    expiresAt: addDays(new Date(), 1),
  });

  const resetLink = `${process.env.PUBLIC_API_URL?.replace('/api/v1', '')}/reset-password?token=${rawToken}&uid=${staff.id}`;

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    entityType: 'staff',
    entityId: staff.id,
    description: `Password reset link generated for ${staff.email}`,
  });

  if (staff.phone) {
    await sendTextMessage({
      organizationId: orgId,
      eventType: 'MANUAL',
      phone: staff.phone,
      text: `Hello ${staff.firstName}, a password reset was requested for your GYMatrix account. Reset your password here: ${resetLink}`,
      idempotencyKey: `reset-${staff.id}-${Date.now()}`,
    }).catch(err => log.error(err, 'Failed to send WhatsApp reset link'));
  }

  return { resetLink };
}
