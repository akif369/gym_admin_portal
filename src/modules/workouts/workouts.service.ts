import { db } from '../../db/index';
import { exercises, workoutTemplates, workoutTemplateExercises, workoutAssignments } from '../../db/schema/workouts.schema';
import { eq, and, ilike, count, desc } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { createLogger } from '../../common/logger/index';

const log = createLogger('workouts-service');

export async function listExercisesService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const conditions: any[] = [eq(exercises.organizationId, orgId)];
  if (query['search']) conditions.push(ilike(exercises.name, `%${query['search']}%`));
  if (query['muscleGroup']) conditions.push(ilike(exercises.muscleGroup, `%${query['muscleGroup']}%`));
  if (query['active'] !== undefined) conditions.push(eq(exercises.isActive, query['active'] === 'true'));
  const whereClause = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(exercises).where(whereClause);
  const items = await db.select().from(exercises).where(whereClause).orderBy(exercises.name).limit(limit).offset(offset);
  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function createExerciseService(orgId: string, data: any, actorId: string) {
  const [exercise] = await db.insert(exercises).values({ ...data, organizationId: orgId, createdBy: actorId }).returning();
  log.info({ exerciseId: exercise!.id }, 'Exercise created');
  return exercise;
}

export async function getExerciseService(orgId: string, exerciseId: string) {
  const [exercise] = await db.select().from(exercises).where(and(eq(exercises.id, exerciseId), eq(exercises.organizationId, orgId))).limit(1);
  if (!exercise) throw AppError.notFound(ErrorCode.EXERCISE_NOT_FOUND, 'Exercise not found');
  return exercise;
}

export async function updateExerciseService(orgId: string, exerciseId: string, data: any) {
  await getExerciseService(orgId, exerciseId);
  const [updated] = await db.update(exercises).set({ ...data, updatedAt: new Date() }).where(eq(exercises.id, exerciseId)).returning();
  return updated;
}

export async function updateExerciseStatusService(orgId: string, exerciseId: string, isActive: boolean) {
  await getExerciseService(orgId, exerciseId);
  const [updated] = await db.update(exercises).set({ isActive, updatedAt: new Date() }).where(eq(exercises.id, exerciseId)).returning({ id: exercises.id, isActive: exercises.isActive });
  return updated;
}

export async function listWorkoutTemplatesService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const [{ total }] = await db.select({ total: count() }).from(workoutTemplates).where(eq(workoutTemplates.organizationId, orgId));
  const items = await db.select().from(workoutTemplates).where(eq(workoutTemplates.organizationId, orgId)).orderBy(workoutTemplates.name).limit(limit).offset(offset);
  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function createWorkoutTemplateService(orgId: string, data: any, actorId: string) {
  const { exercises: exerciseList, ...templateData } = data;
  const [template] = await db.insert(workoutTemplates).values({ ...templateData, organizationId: orgId, createdBy: actorId }).returning();
  if (exerciseList?.length) {
    for (let i = 0; i < exerciseList.length; i++) {
      await db.insert(workoutTemplateExercises).values({ templateId: template!.id, orderIndex: i, ...exerciseList[i] });
    }
  }
  return template;
}

export async function getWorkoutTemplateService(orgId: string, templateId: string) {
  const [template] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.organizationId, orgId))).limit(1);
  if (!template) throw AppError.notFound(ErrorCode.WORKOUT_TEMPLATE_NOT_FOUND, 'Workout template not found');
  const templateExercises = await db.select().from(workoutTemplateExercises).where(eq(workoutTemplateExercises.templateId, templateId)).orderBy(workoutTemplateExercises.orderIndex);
  return { ...template, exercises: templateExercises };
}

export async function updateWorkoutTemplateService(orgId: string, templateId: string, data: any) {
  await getWorkoutTemplateService(orgId, templateId);
  const { exercises: exerciseList, ...templateData } = data;
  const [updated] = await db.update(workoutTemplates).set({ ...templateData, updatedAt: new Date() }).where(eq(workoutTemplates.id, templateId)).returning();
  return updated;
}

export async function assignWorkoutTemplateService(orgId: string, templateId: string, memberIds: string[], actorId: string) {
  await getWorkoutTemplateService(orgId, templateId);
  const inserted = [];
  for (const memberId of memberIds) {
    const [a] = await db.insert(workoutAssignments).values({ templateId, memberId, assignedBy: actorId }).returning();
    inserted.push(a);
  }
  return inserted;
}
