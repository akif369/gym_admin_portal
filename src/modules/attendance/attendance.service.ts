import { db } from '../../db/index';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { members } from '../../db/schema/members.schema';
import { memberMemberships } from '../../db/schema/memberships.schema';
import { paymentTransactions } from '../../db/schema/payments.schema';
import { eq, and, isNull, desc, count, sql, gte, lte, lt, gt, between } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';
import { isStrictPaymentPolicyEnabled } from '../org/org.service';

const log = createLogger('attendance-service');

// ── Check-In ──────────────────────────────────────────────────────────────────

export async function checkInService(
  orgId: string,
  branchId: string | undefined,
  data: { memberId?: string; memberNumber?: string; method?: string; notes?: string },
  actorId?: string,
) {
  // Resolve member
  let member;
  if (data.memberId) {
    const [m] = await db
      .select()
      .from(members)
      .where(and(eq(members.id, data.memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
      .limit(1);
    member = m;
  } else if (data.memberNumber) {
    const [m] = await db
      .select()
      .from(members)
      .where(and(eq(members.memberNumber, data.memberNumber), eq(members.organizationId, orgId), isNull(members.deletedAt)))
      .limit(1);
    member = m;
  }

  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  // Prevent duplicate active check-in
  const [activeSession] = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.memberId, member.id),
        isNull(attendanceLogs.checkOutAt),
      ),
    )
    .limit(1);

  if (activeSession) {
    throw AppError.conflict(ErrorCode.ALREADY_CHECKED_IN, 'Member is already checked in');
  }

  // Validate membership is active.
  const [activeMembership] = await db
    .select({ status: memberMemberships.status, endDate: memberMemberships.endDate, createdAt: memberMemberships.createdAt })
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, member.id), eq(memberMemberships.status, 'ACTIVE')))
    .limit(1);

  const strictPaymentPolicy = await isStrictPaymentPolicyEnabled(orgId);
  let latestPaymentStatus: string | null = null;
  let latestPayment: { status: string; createdAt: Date } | undefined;
  if (strictPaymentPolicy) {
    [latestPayment] = await db
      .select({ status: paymentTransactions.status, createdAt: paymentTransactions.createdAt })
      .from(paymentTransactions)
      .where(and(
        eq(paymentTransactions.memberId, member.id),
        eq(paymentTransactions.organizationId, orgId),
      ))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1);
    latestPaymentStatus = latestPayment?.status ?? null;
  }

  if (!activeMembership) {
    log.warn({ memberId: member.id }, 'Check-in attempted without active membership');
  }

  const paymentCoversMembership = Boolean(
    activeMembership
    && latestPaymentStatus === 'PAID'
    && latestPayment
    && latestPayment.createdAt >= activeMembership.createdAt,
  );

  if (strictPaymentPolicy && (!activeMembership || !paymentCoversMembership)) {
    throw AppError.badRequest(
      ErrorCode.MEMBERSHIP_EXPIRED_OR_INACTIVE,
      !activeMembership
        ? 'Member does not have an active membership'
        : 'Payment is required before this member can check in',
    );
  }

  const [log_] = await db
    .insert(attendanceLogs)
    .values({
      organizationId: orgId,
      branchId,
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
      checkInAt: new Date(),
      checkInMethod: (data.method as any) ?? 'MANUAL',
      checkInBy: actorId,
      notes: data.notes,
    })
    .returning();

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.ATTENDANCE_CHECKED_IN,
    entityType: 'attendance',
    entityId: log_!.id,
    description: `${member.firstName} ${member.lastName} checked in`,
  });

  log.info({ memberId: member.id, attendanceId: log_!.id }, 'Member checked in');
  return log_;
}

// ── Check-Out ─────────────────────────────────────────────────────────────────

export async function checkOutService(
  orgId: string,
  data: { memberId: string; notes?: string },
  actorId?: string,
) {
  const [activeSession] = await db
    .select()
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.memberId, data.memberId),
        eq(attendanceLogs.organizationId, orgId),
        isNull(attendanceLogs.checkOutAt),
      ),
    )
    .orderBy(desc(attendanceLogs.checkInAt))
    .limit(1);

  if (!activeSession) {
    throw AppError.notFound(ErrorCode.NOT_CHECKED_IN, 'Member is not currently checked in');
  }

  const [updated] = await db
    .update(attendanceLogs)
    .set({
      checkOutAt: new Date(),
      checkOutBy: actorId,
      notes: data.notes ?? activeSession.notes,
      updatedAt: new Date(),
    })
    .where(eq(attendanceLogs.id, activeSession.id))
    .returning();

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.ATTENDANCE_CHECKED_OUT,
    entityType: 'attendance',
    entityId: activeSession.id,
  });

  return updated;
}

// ── Currently Inside ──────────────────────────────────────────────────────────

export async function getCurrentlyInsideService(orgId: string) {
  return db
    .select({
      id: attendanceLogs.id,
      memberId: attendanceLogs.memberId,
      memberName: attendanceLogs.memberName,
      checkInAt: attendanceLogs.checkInAt,
      checkInMethod: attendanceLogs.checkInMethod,
    })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.organizationId, orgId), isNull(attendanceLogs.checkOutAt)))
    .orderBy(desc(attendanceLogs.checkInAt));
}

// ── List Attendance ───────────────────────────────────────────────────────────

export async function listAttendanceService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const conditions: any[] = [eq(attendanceLogs.organizationId, orgId)];

  if (query['date']) {
    const date = query['date'] as string;
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    conditions.push(gte(attendanceLogs.checkInAt, start), lte(attendanceLogs.checkInAt, end));
  }

  if (query['memberId']) {
    conditions.push(eq(attendanceLogs.memberId, query['memberId'] as string));
  }

  const whereClause = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(attendanceLogs).where(whereClause);

  const items = await db
    .select()
    .from(attendanceLogs)
    .where(whereClause)
    .orderBy(desc(attendanceLogs.checkInAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Member Attendance History ─────────────────────────────────────────────────

export async function getMemberAttendanceService(orgId: string, memberId: string, query: Record<string, unknown>) {
  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  const [{ total }] = await db
    .select({ total: count() })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.memberId, memberId), eq(attendanceLogs.organizationId, orgId)));

  const items = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.memberId, memberId), eq(attendanceLogs.organizationId, orgId)))
    .orderBy(desc(attendanceLogs.checkInAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Correct Attendance ─────────────────────────────────────────────────────────

export async function correctAttendanceService(
  orgId: string,
  data: { attendanceId: string; checkInAt?: string; checkOutAt?: string; reason: string },
  actorId: string,
) {
  const [log_] = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.id, data.attendanceId), eq(attendanceLogs.organizationId, orgId)))
    .limit(1);

  if (!log_) throw AppError.notFound(ErrorCode.ATTENDANCE_NOT_FOUND, 'Attendance record not found');

  const updates: any = {
    correctedAt: new Date(),
    correctedBy: actorId,
    correctionReason: data.reason,
    updatedAt: new Date(),
  };
  if (data.checkInAt) updates.checkInAt = new Date(data.checkInAt);
  if (data.checkOutAt) updates.checkOutAt = new Date(data.checkOutAt);

  const [updated] = await db
    .update(attendanceLogs)
    .set(updates)
    .where(eq(attendanceLogs.id, data.attendanceId))
    .returning();

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.ATTENDANCE_CORRECTED,
    entityType: 'attendance',
    entityId: data.attendanceId,
    beforeState: log_,
    afterState: updated,
    description: data.reason,
  });

  return updated;
}

// ── Analytics: Peak Hours ─────────────────────────────────────────────────────

export async function getPeakHoursService(orgId: string) {
  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM check_in_at)`.as('hour'),
      count: count(),
    })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.organizationId, orgId))
    .groupBy(sql`EXTRACT(HOUR FROM check_in_at)`)
    .orderBy(sql`EXTRACT(HOUR FROM check_in_at)`);

  return rows.map((r) => ({
    hour: r.hour,
    label: `${r.hour}:00 - ${r.hour + 1}:00`,
    count: r.count,
  }));
}

// ── Analytics: Daily ──────────────────────────────────────────────────────────

export async function getDailyAttendanceService(orgId: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      date: sql<string>`DATE(check_in_at AT TIME ZONE 'UTC')`.as('date'),
      count: count(),
    })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.organizationId, orgId), gte(attendanceLogs.checkInAt, since)))
    .groupBy(sql`DATE(check_in_at AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(check_in_at AT TIME ZONE 'UTC')`);

  return rows;
}
