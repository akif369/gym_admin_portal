import { db } from '../../db/index';
import {
  members, memberEmergencyContacts, memberHealthProfiles, memberMeasurements,
} from '../../db/schema/index';
import { trainers, trainerAssignments } from '../../db/schema/trainers.schema';
import { memberMemberships } from '../../db/schema/memberships.schema';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { paymentTransactions } from '../../db/schema/payments.schema';
import { ptSessions } from '../../db/schema/pt.schema';
import { membershipEvents } from '../../db/schema/memberships.schema';
import { eq, and, isNull, ilike, or, desc, asc, sql, count, lt, lte, gte } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config/env';

const log = createLogger('members-service');

// ── Helper: generate member number ───────────────────────────────────────────

async function generateMemberNumber(orgId: string): Promise<string> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(members)
    .where(eq(members.organizationId, orgId));
  const nextNum = (total ?? 0) + 1;
  return `GYM${String(nextNum).padStart(4, '0')}`;
}

// ── List Members ──────────────────────────────────────────────────────────────

export async function listMembersService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const search = query['search'] as string | undefined;
  const membershipStatus = query['membershipStatus'] as string | undefined;
  const status = query['status'] as string | undefined;

  const conditions: any[] = [
    eq(members.organizationId, orgId),
    isNull(members.deletedAt),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(members.firstName, `%${search}%`),
        ilike(members.lastName, `%${search}%`),
        ilike(members.phone, `%${search}%`),
        ilike(members.email!, `%${search}%`),
        ilike(members.memberNumber, `%${search}%`),
      ),
    );
  }

  if (status) {
    conditions.push(eq(members.status, status as any));
  }

  const whereClause = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(members)
    .where(whereClause);

  // Fetch members with latest membership info via subquery
  const items = await db
    .select({
      id: members.id,
      memberNumber: members.memberNumber,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      gender: members.gender,
      photoUrl: members.photoUrl,
      status: members.status,
      joinDate: members.joinDate,
      goal: members.goal,
      experienceLevel: members.experienceLevel,
      branchId: members.branchId,
      createdAt: members.createdAt,
      membershipPlan: sql<string | null>`(
        SELECT ${memberMemberships.planName}
        FROM ${memberMemberships}
        WHERE ${memberMemberships.memberId} = ${members.id}
        ORDER BY ${memberMemberships.createdAt} DESC
        LIMIT 1
      )`,
      membershipStart: sql<string | null>`(
        SELECT ${memberMemberships.startDate}
        FROM ${memberMemberships}
        WHERE ${memberMemberships.memberId} = ${members.id}
        ORDER BY ${memberMemberships.createdAt} DESC
        LIMIT 1
      )`,
      membershipExpiry: sql<string | null>`(
        SELECT ${memberMemberships.endDate}
        FROM ${memberMemberships}
        WHERE ${memberMemberships.memberId} = ${members.id}
        ORDER BY ${memberMemberships.createdAt} DESC
        LIMIT 1
      )`,
      membershipStatus: sql<string | null>`(
        SELECT ${memberMemberships.status}
        FROM ${memberMemberships}
        WHERE ${memberMemberships.memberId} = ${members.id}
        ORDER BY ${memberMemberships.createdAt} DESC
        LIMIT 1
      )`,
      lastVisit: sql<Date | null>`(
        SELECT ${attendanceLogs.checkInAt}
        FROM ${attendanceLogs}
        WHERE ${attendanceLogs.memberId} = ${members.id}
        ORDER BY ${attendanceLogs.checkInAt} DESC
        LIMIT 1
      )`,
    })
    .from(members)
    .where(whereClause)
    .orderBy(desc(members.createdAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Create Member ─────────────────────────────────────────────────────────────

export async function createMemberService(
  orgId: string,
  data: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    gender?: string;
    dob?: string;
    address?: string;
    goal?: string;
    experienceLevel?: string;
    branchId?: string;
    joinDate: string;
    notes?: string;
    emergency?: { name: string; phone: string; relation: string };
    health?: { medicalConditions?: string; allergies?: string; injuries?: string; bloodGroup?: string };
  },
  actorId: string,
) {
  const memberNumber = await generateMemberNumber(orgId);

  const [member] = await db
    .insert(members)
    .values({
      organizationId: orgId,
      branchId: data.branchId,
      memberNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      gender: data.gender as any,
      dob: data.dob,
      address: data.address,
      goal: data.goal,
      experienceLevel: data.experienceLevel as any,
      joinDate: data.joinDate,
      notes: data.notes,
    })
    .returning();

  if (!member) throw AppError.internal('Failed to create member');

  // Emergency contact
  if (data.emergency) {
    await db.insert(memberEmergencyContacts).values({
      memberId: member.id,
      name: data.emergency.name,
      phone: data.emergency.phone,
      relation: data.emergency.relation,
    });
  }

  // Health profile
  if (data.health) {
    await db.insert(memberHealthProfiles).values({
      memberId: member.id,
      ...data.health,
    });
  }

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.MEMBER_CREATED,
    entityType: 'member',
    entityId: member.id,
    description: `Member ${member.memberNumber} created: ${member.firstName} ${member.lastName}`,
  });

  log.info({ memberId: member.id, memberNumber }, 'Member created');
  return member;
}

// ── Get Member ────────────────────────────────────────────────────────────────

export async function getMemberService(orgId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);

  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  // Emergency contact
  const [emergency] = await db
    .select()
    .from(memberEmergencyContacts)
    .where(eq(memberEmergencyContacts.memberId, memberId))
    .limit(1);

  // Health profile
  const [health] = await db
    .select()
    .from(memberHealthProfiles)
    .where(eq(memberHealthProfiles.memberId, memberId))
    .limit(1);

  // Active trainer assignment
  const [assignment] = await db
    .select({ trainer: trainers })
    .from(trainerAssignments)
    .innerJoin(trainers, eq(trainers.id, trainerAssignments.trainerId))
    .where(and(
      eq(trainerAssignments.memberId, memberId),
      isNull(trainerAssignments.unassignedAt),
    ))
    .limit(1);

  // Latest membership
  const [latestMembership] = await db
    .select()
    .from(memberMemberships)
    .where(eq(memberMemberships.memberId, memberId))
    .orderBy(desc(memberMemberships.createdAt))
    .limit(1);

  return {
    ...member,
    emergency: emergency ?? null,
    health: health ?? null,
    trainer: assignment?.trainer ?? null,
    latestMembership: latestMembership ?? null,
  };
}

// ── Update Member ─────────────────────────────────────────────────────────────

export async function updateMemberService(
  orgId: string,
  memberId: string,
  data: Partial<typeof members.$inferInsert>,
  actorId: string,
) {
  const before = await getMemberService(orgId, memberId);

  const [updated] = await db
    .update(members)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .returning();

  if (!updated) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.MEMBER_UPDATED,
    entityType: 'member',
    entityId: memberId,
    beforeState: before,
    afterState: updated,
  });

  return updated;
}

// ── Update Member Status ──────────────────────────────────────────────────────

export async function updateMemberStatusService(
  orgId: string,
  memberId: string,
  status: string,
  actorId: string,
) {
  const [updated] = await db
    .update(members)
    .set({ status: status as any, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .returning({ id: members.id, status: members.status });

  if (!updated) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.MEMBER_STATUS_CHANGED,
    entityType: 'member',
    entityId: memberId,
    description: `Status changed to ${status}`,
  });

  return updated;
}

// ── Member Activity Timeline ──────────────────────────────────────────────────

export async function getMemberActivityService(orgId: string, memberId: string) {
  await getMemberService(orgId, memberId); // validates access

  // Gather events from multiple sources and merge
  const [attendances, payments, membershipEvts] = await Promise.all([
    db.select({
      createdAt: attendanceLogs.checkInAt,
      type: sql<string>`'ATTENDANCE'`.as('type'),
      description: sql<string>`'Checked in'`.as('description'),
    }).from(attendanceLogs)
      .where(eq(attendanceLogs.memberId, memberId))
      .orderBy(desc(attendanceLogs.checkInAt))
      .limit(20),

    db.select({
      createdAt: paymentTransactions.createdAt,
      type: sql<string>`'PAYMENT'`.as('type'),
      description: sql<string>`concat('Payment ₹', payment_transactions.total_amount, ' received (', payment_transactions.payment_method, ')')`.as('description'),
    }).from(paymentTransactions)
      .where(eq(paymentTransactions.memberId, memberId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(20),

    db.select({
      createdAt: membershipEvents.createdAt,
      type: membershipEvents.eventType,
      description: membershipEvents.notes,
    }).from(membershipEvents)
      .where(eq(membershipEvents.memberId, memberId))
      .orderBy(desc(membershipEvents.createdAt))
      .limit(20),
  ]);

  const timeline = [...attendances, ...payments, ...membershipEvts]
    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
    .slice(0, 50);

  return timeline;
}

// ── Member Measurements ───────────────────────────────────────────────────────

export async function getMemberMeasurementsService(memberId: string) {
  return db
    .select()
    .from(memberMeasurements)
    .where(eq(memberMeasurements.memberId, memberId))
    .orderBy(desc(memberMeasurements.recordedAt));
}

export async function addMemberMeasurementService(
  orgId: string,
  memberId: string,
  data: Omit<typeof memberMeasurements.$inferInsert, 'id' | 'memberId' | 'createdAt'>,
  actorId: string,
) {
  await getMemberService(orgId, memberId); // validate

  const [measurement] = await db
    .insert(memberMeasurements)
    .values({ ...data, memberId, recordedBy: actorId })
    .returning();

  return measurement;
}

// ── Health Profile ────────────────────────────────────────────────────────────

export async function getMemberHealthProfileService(orgId: string, memberId: string) {
  await getMemberService(orgId, memberId);

  const [health] = await db
    .select()
    .from(memberHealthProfiles)
    .where(eq(memberHealthProfiles.memberId, memberId))
    .limit(1);

  return health ?? null;
}

export async function updateMemberHealthProfileService(
  orgId: string,
  memberId: string,
  data: Partial<typeof memberHealthProfiles.$inferInsert>,
) {
  await getMemberService(orgId, memberId);

  const [existing] = await db
    .select({ id: memberHealthProfiles.id })
    .from(memberHealthProfiles)
    .where(eq(memberHealthProfiles.memberId, memberId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(memberHealthProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(memberHealthProfiles.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(memberHealthProfiles)
      .values({ memberId, ...data })
      .returning();
    return created;
  }
}

// ── Upload Member Photo ───────────────────────────────────────────────────────

export async function uploadMemberPhotoService(
  orgId: string,
  memberId: string,
  fileBuffer: Buffer,
  filename: string,
  actorId: string,
) {
  await getMemberService(orgId, memberId);

  const ext = path.extname(filename).toLowerCase() || '.jpg';
  const photoFilename = `member_${memberId}${ext}`;
  const uploadPath = path.join(path.resolve(config.uploadDir), 'members', photoFilename);

  const dir = path.dirname(uploadPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(uploadPath, fileBuffer);
  const photoUrl = `/uploads/members/${photoFilename}`;

  await db
    .update(members)
    .set({ photoUrl, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.MEMBER_PHOTO_UPLOADED,
    entityType: 'member',
    entityId: memberId,
  });

  return { photoUrl };
}
