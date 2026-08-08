import { db } from '../../db/index';
import { trainers, trainerAssignments } from '../../db/schema/trainers.schema';
import { members } from '../../db/schema/members.schema';
import { ptSessions } from '../../db/schema/pt.schema';
import { eq, and, isNull, desc, count, ilike, or } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { createLogger } from '../../common/logger/index';

const log = createLogger('trainers-service');

export async function listTrainersService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const search = query['search'] as string | undefined;
  const conditions: any[] = [eq(trainers.organizationId, orgId), isNull(trainers.deletedAt)];
  if (search) conditions.push(or(ilike(trainers.name, `%${search}%`), ilike(trainers.specialization!, `%${search}%`)));
  const whereClause = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(trainers).where(whereClause);
  const items = await db.select().from(trainers).where(whereClause).orderBy(trainers.name).limit(limit).offset(offset);
  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function createTrainerService(orgId: string, data: any) {
  const [trainer] = await db.insert(trainers).values({ ...data, organizationId: orgId }).returning();
  log.info({ trainerId: trainer!.id }, 'Trainer created');
  return trainer;
}

export async function getTrainerService(orgId: string, trainerId: string) {
  const [trainer] = await db.select().from(trainers)
    .where(and(eq(trainers.id, trainerId), eq(trainers.organizationId, orgId), isNull(trainers.deletedAt)))
    .limit(1);
  if (!trainer) throw AppError.notFound(ErrorCode.TRAINER_NOT_FOUND, 'Trainer not found');
  return trainer;
}

export async function updateTrainerService(orgId: string, trainerId: string, data: any) {
  await getTrainerService(orgId, trainerId);
  const [updated] = await db.update(trainers).set({ ...data, updatedAt: new Date() }).where(eq(trainers.id, trainerId)).returning();
  return updated;
}

export async function updateTrainerStatusService(orgId: string, trainerId: string, status: string) {
  await getTrainerService(orgId, trainerId);
  const [updated] = await db.update(trainers).set({ status: status as any, updatedAt: new Date() }).where(eq(trainers.id, trainerId)).returning({ id: trainers.id, status: trainers.status });
  return updated;
}

export async function getTrainerMembersService(orgId: string, trainerId: string) {
  await getTrainerService(orgId, trainerId);
  return db.select({ member: members, assignment: trainerAssignments })
    .from(trainerAssignments)
    .innerJoin(members, eq(members.id, trainerAssignments.memberId))
    .where(and(eq(trainerAssignments.trainerId, trainerId), isNull(trainerAssignments.unassignedAt), isNull(members.deletedAt)));
}

export async function assignMembersService(orgId: string, trainerId: string, memberIds: string[], actorId: string) {
  await getTrainerService(orgId, trainerId);
  const inserted = [];
  for (const memberId of memberIds) {
    // Check not already assigned
    const [existing] = await db.select().from(trainerAssignments)
      .where(and(eq(trainerAssignments.trainerId, trainerId), eq(trainerAssignments.memberId, memberId), isNull(trainerAssignments.unassignedAt)))
      .limit(1);
    if (!existing) {
      const [a] = await db.insert(trainerAssignments).values({ trainerId, memberId, assignedBy: actorId }).returning();
      inserted.push(a);
    }
  }
  return inserted;
}

export async function removeTrainerMemberService(orgId: string, trainerId: string, memberId: string, actorId: string) {
  await getTrainerService(orgId, trainerId);
  await db.update(trainerAssignments)
    .set({ unassignedAt: new Date() })
    .where(and(eq(trainerAssignments.trainerId, trainerId), eq(trainerAssignments.memberId, memberId), isNull(trainerAssignments.unassignedAt)));
}

export async function getTrainerPerformanceService(orgId: string, trainerId: string) {
  const trainer = await getTrainerService(orgId, trainerId);
  const [{ memberCount }] = await db
    .select({ memberCount: count() }).from(trainerAssignments)
    .where(and(eq(trainerAssignments.trainerId, trainerId), isNull(trainerAssignments.unassignedAt)));
  const [{ totalSessions }] = await db
    .select({ totalSessions: count() }).from(ptSessions)
    .where(eq(ptSessions.trainerId, trainerId));
  const [{ completedSessions }] = await db
    .select({ completedSessions: count() }).from(ptSessions)
    .where(and(eq(ptSessions.trainerId, trainerId), eq(ptSessions.status, 'COMPLETED')));
  return {
    trainer,
    stats: {
      membersAssigned: memberCount ?? 0,
      totalSessions: totalSessions ?? 0,
      completedSessions: completedSessions ?? 0,
      completionRate: (totalSessions ?? 0) > 0 ? Math.round(((completedSessions ?? 0) / (totalSessions ?? 0)) * 100) : 0,
    },
  };
}
