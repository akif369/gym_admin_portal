import { db } from '../../db/index';
import { leads, leadActivities } from '../../db/schema/leads.schema';
import { eq, and, isNull, desc, count, ilike, or } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { parsePagination, paginationToLimitOffset, buildPaginatedResponse } from '../../common/pagination/paginate';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';

const log = createLogger('leads-service');

export async function listLeadsService(orgId: string, query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const { limit, offset } = paginationToLimitOffset({ page, pageSize });
  const conditions: any[] = [eq(leads.organizationId, orgId), isNull(leads.deletedAt)];
  if (query['status']) conditions.push(eq(leads.status, query['status'] as any));
  if (query['source']) conditions.push(eq(leads.source, query['source'] as any));
  if (query['search']) conditions.push(or(ilike(leads.name, `%${query['search']}%`), ilike(leads.phone, `%${query['search']}%`)));
  const whereClause = and(...conditions);
  const totalRes = await db.select({ total: count() }).from(leads).where(whereClause);
  const total = totalRes[0]?.total ?? 0;
  const items = await db.select().from(leads).where(whereClause).orderBy(desc(leads.createdAt)).limit(limit).offset(offset);
  return buildPaginatedResponse(items, total ?? 0, { page, pageSize });
}

export async function createLeadService(orgId: string, data: any, actorId: string) {
  const [lead] = await db.insert(leads).values({ ...data, organizationId: orgId, createdBy: actorId }).returning();
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.LEAD_CREATED, entityType: 'lead', entityId: lead!.id });
  log.info({ leadId: lead!.id }, 'Lead created');
  return lead;
}

export async function getLeadService(orgId: string, leadId: string) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.organizationId, orgId), isNull(leads.deletedAt))).limit(1);
  if (!lead) throw AppError.notFound(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
  const activities = await db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.createdAt));
  return { ...lead, activities };
}

export async function updateLeadService(orgId: string, leadId: string, data: any) {
  await getLeadService(orgId, leadId);
  const [updated] = await db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, leadId)).returning();
  return updated;
}

export async function updateLeadStatusService(orgId: string, leadId: string, status: string, actorId: string) {
  const lead = await getLeadService(orgId, leadId);
  const [updated] = await db.update(leads).set({ status: status as any, updatedAt: new Date() }).where(eq(leads.id, leadId)).returning({ id: leads.id, status: leads.status });
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.LEAD_STATUS_CHANGED, entityType: 'lead', entityId: leadId, description: `Status: ${lead.status} → ${status}` });
  return updated;
}

export async function addLeadActivityService(orgId: string, leadId: string, data: any, actorId: string) {
  await getLeadService(orgId, leadId);
  const [activity] = await db.insert(leadActivities).values({ ...data, leadId, actorId }).returning();
  return activity;
}

export async function convertLeadService(orgId: string, leadId: string, actorId: string) {
  const lead = await getLeadService(orgId, leadId);
  if (lead.status === 'JOINED') throw AppError.conflict(ErrorCode.LEAD_ALREADY_CONVERTED, 'Lead already converted');
  const [updated] = await db.update(leads).set({ status: 'JOINED', updatedAt: new Date() }).where(eq(leads.id, leadId)).returning();
  await auditLog({ organizationId: orgId, actorId, action: AuditAction.LEAD_CONVERTED, entityType: 'lead', entityId: leadId });
  return updated;
}

export async function getLeadSourcesAnalyticsService(orgId: string) {
  const rows = await db
    .select({ source: leads.source, count: count() })
    .from(leads)
    .where(and(eq(leads.organizationId, orgId), isNull(leads.deletedAt)))
    .groupBy(leads.source);
  return rows;
}

export async function getLeadPipelineAnalyticsService(orgId: string) {
  const rows = await db
    .select({ status: leads.status, count: count() })
    .from(leads)
    .where(and(eq(leads.organizationId, orgId), isNull(leads.deletedAt)))
    .groupBy(leads.status);
  return rows;
}
