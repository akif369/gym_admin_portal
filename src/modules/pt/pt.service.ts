import { db } from '../../db/index';
import { ptPackages, ptSessions, memberPtPackages } from '../../db/schema/pt.schema';
import { trainers } from '../../db/schema/trainers.schema';
import { members } from '../../db/schema/members.schema';
import { eq, and, isNull, desc, count, gte, lte, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { createLogger } from '../../common/logger/index';

const log = createLogger('pt-service');

export async function listPackagesService(orgId: string) {
  return db.select().from(ptPackages).where(and(eq(ptPackages.organizationId, orgId), eq(ptPackages.status, 'ACTIVE'))).orderBy(ptPackages.sessionsCount);
}

export async function createPackageService(orgId: string, data: any) {
  const [pkg] = await db.insert(ptPackages).values({ ...data, organizationId: orgId }).returning();
  return pkg;
}

export async function updatePackageService(orgId: string, packageId: string, data: any) {
  const [updated] = await db.update(ptPackages).set({ ...data, updatedAt: new Date() })
    .where(and(eq(ptPackages.id, packageId), eq(ptPackages.organizationId, orgId))).returning();
  if (!updated) throw AppError.notFound(ErrorCode.PT_PACKAGE_NOT_FOUND, 'PT Package not found');
  return updated;
}

export async function listSessionsService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const conditions: any[] = [eq(ptSessions.organizationId, orgId)];
  if (query['trainerId']) conditions.push(eq(ptSessions.trainerId, query['trainerId'] as string));
  if (query['memberId']) conditions.push(eq(ptSessions.memberId, query['memberId'] as string));
  if (query['status']) conditions.push(eq(ptSessions.status, query['status'] as any));
  if (query['date']) {
    const date = query['date'] as string;
    conditions.push(gte(ptSessions.scheduledAt, new Date(`${date}T00:00:00Z`)));
    conditions.push(lte(ptSessions.scheduledAt, new Date(`${date}T23:59:59Z`)));
  }
  const whereClause = and(...conditions);
  const totalRes = await db.select({ total: count() }).from(ptSessions).where(whereClause);
  const total = totalRes[0]?.total ?? 0;
  const items = await db.select().from(ptSessions).where(whereClause).orderBy(desc(ptSessions.scheduledAt)).limit(limit).offset(offset);
  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function getTodaySessionsService(orgId: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return db.select().from(ptSessions)
    .where(and(eq(ptSessions.organizationId, orgId), gte(ptSessions.scheduledAt, start), lte(ptSessions.scheduledAt, end)))
    .orderBy(ptSessions.scheduledAt);
}

export async function bookSessionService(orgId: string, data: any, actorId: string) {
  // Validate trainer
  const [trainer] = await db.select({ name: trainers.name }).from(trainers).where(eq(trainers.id, data.trainerId)).limit(1);
  if (!trainer) throw AppError.notFound(ErrorCode.TRAINER_NOT_FOUND, 'Trainer not found');

  // Validate member
  const [member] = await db.select({ firstName: members.firstName, lastName: members.lastName }).from(members).where(eq(members.id, data.memberId)).limit(1);
  if (!member) throw AppError.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

  const [session] = await db.insert(ptSessions).values({
    ...data,
    organizationId: orgId,
    memberName: `${member.firstName} ${member.lastName}`,
    trainerName: trainer.name,
    createdBy: actorId,
  }).returning();
  log.info({ sessionId: session!.id }, 'PT session booked');
  return session;
}

export async function getSessionService(orgId: string, sessionId: string) {
  const [session] = await db.select().from(ptSessions)
    .where(and(eq(ptSessions.id, sessionId), eq(ptSessions.organizationId, orgId))).limit(1);
  if (!session) throw AppError.notFound(ErrorCode.PT_SESSION_NOT_FOUND, 'PT Session not found');
  return session;
}

export async function updateSessionService(orgId: string, sessionId: string, data: any) {
  await getSessionService(orgId, sessionId);
  const [updated] = await db.update(ptSessions).set({ ...data, updatedAt: new Date() }).where(eq(ptSessions.id, sessionId)).returning();
  return updated;
}

export async function completeSessionService(orgId: string, sessionId: string, notes?: string) {
  const session = await getSessionService(orgId, sessionId);
  if (session.status !== 'UPCOMING') throw AppError.conflict(ErrorCode.PT_SESSION_NOT_UPCOMING, 'Session is not upcoming');
  const [updated] = await db.update(ptSessions)
    .set({ status: 'COMPLETED', completedAt: new Date(), notes: notes ?? session.notes, updatedAt: new Date() })
    .where(eq(ptSessions.id, sessionId)).returning();

  // Decrement package sessions
  if (session.memberPtPackageId) {
    await db.update(memberPtPackages).set({ sessionsUsed: sql`sessions_used + 1` }).where(eq(memberPtPackages.id, session.memberPtPackageId));
  }
  return updated;
}

export async function cancelSessionService(orgId: string, sessionId: string, reason: string) {
  const session = await getSessionService(orgId, sessionId);
  if (session.status !== 'UPCOMING') throw AppError.conflict(ErrorCode.PT_SESSION_NOT_UPCOMING, 'Session is not upcoming');
  const [updated] = await db.update(ptSessions)
    .set({ status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason, updatedAt: new Date() })
    .where(eq(ptSessions.id, sessionId)).returning();
  return updated;
}

export async function missSessionService(orgId: string, sessionId: string) {
  const session = await getSessionService(orgId, sessionId);
  if (session.status !== 'UPCOMING') throw AppError.conflict(ErrorCode.PT_SESSION_NOT_UPCOMING, 'Session is not upcoming');
  const [updated] = await db.update(ptSessions)
    .set({ status: 'MISSED', updatedAt: new Date() })
    .where(eq(ptSessions.id, sessionId)).returning();
  return updated;
}
