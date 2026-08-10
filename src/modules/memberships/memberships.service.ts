import { addDays, parseISO } from 'date-fns';
import { db } from '../../db/index';
import { membershipPlans, memberMemberships, membershipEvents } from '../../db/schema/memberships.schema';
import { members } from '../../db/schema/members.schema';
import { eq, and, isNull, desc, asc, count, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';

const log = createLogger('memberships-service');

// ── Helper: emit membership event ─────────────────────────────────────────────

async function emitEvent(
  membershipId: string | null,
  memberId: string,
  eventType: typeof membershipEvents.$inferInsert['eventType'],
  actorId?: string,
  actorName?: string,
  notes?: string,
  metadata?: unknown,
) {
  await db.insert(membershipEvents).values({
    membershipId,
    memberId,
    eventType,
    actorId,
    actorName,
    notes,
    metadata: metadata as any,
  });
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function listPlansService(orgId: string) {
  return db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.organizationId, orgId))
    .orderBy(asc(membershipPlans.durationDays));
}

export async function createPlanService(orgId: string, data: Omit<typeof membershipPlans.$inferInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>) {
  const [plan] = await db.insert(membershipPlans).values({ ...data, organizationId: orgId }).returning();
  log.info({ planId: plan!.id, name: data.name }, 'Membership plan created');
  return plan;
}

export async function getPlanService(orgId: string, planId: string) {
  const [plan] = await db
    .select()
    .from(membershipPlans)
    .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.organizationId, orgId)))
    .limit(1);
  if (!plan) throw AppError.notFound(ErrorCode.MEMBERSHIP_PLAN_NOT_FOUND, 'Membership plan not found');
  return plan;
}

export async function updatePlanService(orgId: string, planId: string, data: Partial<typeof membershipPlans.$inferInsert>) {
  await getPlanService(orgId, planId);
  const [updated] = await db
    .update(membershipPlans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(membershipPlans.id, planId))
    .returning();
  return updated;
}

export async function updatePlanStatusService(orgId: string, planId: string, status: 'ACTIVE' | 'INACTIVE') {
  await getPlanService(orgId, planId);
  const [updated] = await db
    .update(membershipPlans)
    .set({ status, updatedAt: new Date() })
    .where(eq(membershipPlans.id, planId))
    .returning({ id: membershipPlans.id, status: membershipPlans.status });
  return updated;
}

// ── Member Memberships ────────────────────────────────────────────────────────

export async function getMemberMembershipsService(orgId: string, memberId: string) {
  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  return db
    .select()
    .from(memberMemberships)
    .where(eq(memberMemberships.memberId, memberId))
    .orderBy(desc(memberMemberships.createdAt));
}

export async function getMembershipEventsService(orgId: string, memberId: string) {
  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  return db
    .select()
    .from(membershipEvents)
    .where(eq(membershipEvents.memberId, memberId))
    .orderBy(desc(membershipEvents.createdAt));
}

// ── List All Membership Events (org-wide) ─────────────────────────────────────

export async function listMembershipEventsService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });

  // Join membership events with member data for names
  const [{ total }] = await db
    .select({ total: count() })
    .from(membershipEvents)
    .innerJoin(members, eq(members.id, membershipEvents.memberId))
    .where(eq(members.organizationId, orgId));

  const items = await db
    .select({
      id: membershipEvents.id,
      memberId: membershipEvents.memberId,
      membershipId: membershipEvents.membershipId,
      eventType: membershipEvents.eventType,
      actorId: membershipEvents.actorId,
      actorName: membershipEvents.actorName,
      notes: membershipEvents.notes,
      createdAt: membershipEvents.createdAt,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(membershipEvents)
    .innerJoin(members, eq(members.id, membershipEvents.memberId))
    .where(eq(members.organizationId, orgId))
    .orderBy(desc(membershipEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

// ── Validate idempotency ──────────────────────────────────────────────────────

async function checkIdempotency(key?: string): Promise<boolean> {
  if (!key) return false;
  const [existing] = await db
    .select({ id: memberMemberships.id })
    .from(memberMemberships)
    .where(eq(memberMemberships.idempotencyKey, key))
    .limit(1);
  return !!existing;
}

// ── Create Membership ─────────────────────────────────────────────────────────

export async function createMembershipService(
  orgId: string,
  memberId: string,
  data: {
    planId: string;
    startDate: string;
    notes?: string;
    idempotencyKey?: string;
  },
  actorId: string,
  actorName?: string,
) {
  if (data.idempotencyKey && await checkIdempotency(data.idempotencyKey)) {
    throw AppError.conflict(ErrorCode.IDEMPOTENCY_CONFLICT, 'Duplicate request with same idempotency key');
  }

  const plan = await getPlanService(orgId, data.planId);
  if (plan.status === 'INACTIVE') {
    throw AppError.badRequest(ErrorCode.MEMBERSHIP_PLAN_INACTIVE, 'Membership plan is not active');
  }

  const startDate = parseISO(data.startDate);
  const endDate = addDays(startDate, plan.durationDays);

  const [membership] = await db
    .insert(memberMemberships)
    .values({
      memberId,
      planId: plan.id,
      planName: plan.name,
      startDate: data.startDate,
      endDate: endDate.toISOString().split('T')[0],
      status: 'PENDING',
      ptSessionsTotal: plan.ptSessionsIncluded,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey,
      createdBy: actorId,
    })
    .returning();

  await emitEvent(membership!.id, memberId, 'CREATED', actorId, actorName, data.notes, { plan: { id: plan.id, name: plan.name, durationDays: plan.durationDays } });

  await auditLog({
    organizationId: orgId,
    actorId,
    action: AuditAction.MEMBERSHIP_CREATED,
    entityType: 'membership',
    entityId: membership!.id,
    description: `Membership created: ${plan.name}`,
    afterState: membership,
  });

  log.info({ memberId, membershipId: membership!.id, plan: plan.name }, 'Membership created');
  return membership;
}

// ── Activate Membership ───────────────────────────────────────────────────────

export async function activateMembershipService(orgId: string, memberId: string, actorId: string, actorName?: string) {
  const [membership] = await db
    .select()
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, memberId), eq(memberMemberships.status, 'PENDING')))
    .orderBy(desc(memberMemberships.createdAt))
    .limit(1);

  if (!membership) throw AppError.notFound(ErrorCode.MEMBERSHIP_NOT_FOUND, 'No pending membership found');

  const [updated] = await db
    .update(memberMemberships)
    .set({ status: 'ACTIVE', updatedAt: new Date() })
    .where(eq(memberMemberships.id, membership.id))
    .returning();

  await emitEvent(membership.id, memberId, 'ACTIVATED', actorId, actorName);
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_ACTIVATED, entityType: 'membership', entityId: membership.id });
  return updated;
}

// ── Renew Membership ──────────────────────────────────────────────────────────

export async function renewMembershipService(
  orgId: string,
  memberId: string,
  data: { planId?: string; notes?: string; idempotencyKey?: string },
  actorId: string,
  actorName?: string,
) {
  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, orgId), isNull(members.deletedAt)))
    .limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  if (data.idempotencyKey) {
    const [existing] = await db.select({ membership: memberMemberships })
      .from(memberMemberships)
      .innerJoin(members, eq(members.id, memberMemberships.memberId))
      .where(and(
        eq(memberMemberships.idempotencyKey, data.idempotencyKey),
        eq(members.organizationId, orgId),
      ))
      .limit(1);
    if (existing) return existing.membership;
  }

  // Get current active membership
  const [current] = await db
    .select()
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, memberId), eq(memberMemberships.status, 'ACTIVE')))
    .limit(1);

  const planId = data.planId ?? current?.planId;
  if (!planId) throw AppError.badRequest(ErrorCode.MEMBERSHIP_NOT_FOUND, 'No active membership or plan specified');

  const plan = await getPlanService(orgId, planId);

  // New membership starts from expiry of current (or today)
  const newStartDate = current?.endDate
    ? addDays(parseISO(current.endDate), 1)
    : new Date();
  const newEndDate = addDays(newStartDate, plan.durationDays);

  const [membership] = await db
    .insert(memberMemberships)
    .values({
      memberId,
      planId: plan.id,
      planName: plan.name,
      startDate: newStartDate.toISOString().split('T')[0],
      endDate: newEndDate.toISOString().split('T')[0],
      status: 'ACTIVE',
      ptSessionsTotal: plan.ptSessionsIncluded,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey,
      createdBy: actorId,
    })
    .returning();

  // Mark old as expired
  if (current) {
    await db.update(memberMemberships).set({ status: 'EXPIRED', updatedAt: new Date() }).where(eq(memberMemberships.id, current.id));
  }

  await emitEvent(membership!.id, memberId, 'RENEWED', actorId, actorName, data.notes, { plan: { name: plan.name } });
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_RENEWED, entityType: 'membership', entityId: membership!.id });
  return membership;
}

// ── Freeze Membership ─────────────────────────────────────────────────────────

export async function freezeMembershipService(
  orgId: string,
  memberId: string,
  data: { freezeStart: string; freezeEnd: string; reason?: string },
  actorId: string,
  actorName?: string,
) {
  const [membership] = await db
    .select()
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, memberId), eq(memberMemberships.status, 'ACTIVE')))
    .limit(1);

  if (!membership) throw AppError.notFound(ErrorCode.MEMBERSHIP_NOT_ACTIVE, 'No active membership to freeze');

  const freezeDays = Math.ceil(
    (parseISO(data.freezeEnd).getTime() - parseISO(data.freezeStart).getTime()) / (1000 * 60 * 60 * 24),
  );

  // Extend end date by freeze period
  const newEndDate = addDays(parseISO(membership.endDate), freezeDays);

  const [updated] = await db
    .update(memberMemberships)
    .set({
      status: 'FROZEN',
      freezeStartDate: data.freezeStart,
      freezeEndDate: data.freezeEnd,
      frozenDays: membership.frozenDays + freezeDays,
      endDate: newEndDate.toISOString().split('T')[0],
      updatedAt: new Date(),
    })
    .where(eq(memberMemberships.id, membership.id))
    .returning();

  await emitEvent(membership.id, memberId, 'FROZEN', actorId, actorName, data.reason, { freezeStart: data.freezeStart, freezeEnd: data.freezeEnd, freezeDays });
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_FROZEN, entityType: 'membership', entityId: membership.id });
  return updated;
}

// ── Resume Membership ─────────────────────────────────────────────────────────

export async function resumeMembershipService(orgId: string, memberId: string, actorId: string, actorName?: string) {
  const [membership] = await db
    .select()
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, memberId), eq(memberMemberships.status, 'FROZEN')))
    .limit(1);

  if (!membership) throw AppError.notFound(ErrorCode.MEMBERSHIP_NOT_FROZEN, 'No frozen membership found');

  const [updated] = await db
    .update(memberMemberships)
    .set({ status: 'ACTIVE', updatedAt: new Date() })
    .where(eq(memberMemberships.id, membership.id))
    .returning();

  await emitEvent(membership.id, memberId, 'RESUMED', actorId, actorName);
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_RESUMED, entityType: 'membership', entityId: membership.id });
  return updated;
}

// ── Cancel Membership ─────────────────────────────────────────────────────────

export async function cancelMembershipService(orgId: string, memberId: string, reason: string, actorId: string, actorName?: string) {
  const [membership] = await db
    .select()
    .from(memberMemberships)
    .where(and(
      eq(memberMemberships.memberId, memberId),
      // Can cancel ACTIVE or PENDING
    ))
    .orderBy(desc(memberMemberships.createdAt))
    .limit(1);

  if (!membership || !['ACTIVE', 'PENDING'].includes(membership.status)) {
    throw AppError.notFound(ErrorCode.MEMBERSHIP_NOT_FOUND, 'No cancellable membership found');
  }

  const [updated] = await db
    .update(memberMemberships)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(eq(memberMemberships.id, membership.id))
    .returning();

  await emitEvent(membership.id, memberId, 'CANCELLED', actorId, actorName, reason);
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_CANCELLED, entityType: 'membership', entityId: membership.id, description: reason });
  return updated;
}

// ── Extend Membership ─────────────────────────────────────────────────────────

export async function extendMembershipService(orgId: string, memberId: string, days: number, reason: string, actorId: string, actorName?: string) {
  const [membership] = await db
    .select()
    .from(memberMemberships)
    .where(and(eq(memberMemberships.memberId, memberId), eq(memberMemberships.status, 'ACTIVE')))
    .limit(1);

  if (!membership) throw AppError.notFound(ErrorCode.MEMBERSHIP_NOT_ACTIVE, 'No active membership to extend');

  const newEndDate = addDays(parseISO(membership.endDate), days);

  const [updated] = await db
    .update(memberMemberships)
    .set({ endDate: newEndDate.toISOString().split('T')[0], updatedAt: new Date() })
    .where(eq(memberMemberships.id, membership.id))
    .returning();

  await emitEvent(membership.id, memberId, 'EXTENDED', actorId, actorName, reason, { extendedBy: days });
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.MEMBERSHIP_EXTENDED, entityType: 'membership', entityId: membership.id, description: `Extended by ${days} days` });
  return updated;
}
