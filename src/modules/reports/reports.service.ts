import { db } from '../../db/index';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { paymentTransactions } from '../../db/schema/payments.schema';
import { members } from '../../db/schema/members.schema';
import { memberMemberships } from '../../db/schema/memberships.schema';
import { trainers } from '../../db/schema/trainers.schema';
import { ptSessions } from '../../db/schema/pt.schema';
import { reportExports } from '../../db/schema/payments.schema';
import { eq, and, gte, lte, desc, count, sum, sql } from 'drizzle-orm';
import { parsePagination } from '../../common/pagination/paginate';
import { createLogger } from '../../common/logger/index';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config/env';

const log = createLogger('reports-service');

// ── Attendance Report ─────────────────────────────────────────────────────────

export async function getAttendanceReportService(orgId: string, query: Record<string, unknown>) {
  const conditions: any[] = [eq(attendanceLogs.organizationId, orgId)];
  if (query['dateFrom']) conditions.push(gte(attendanceLogs.checkInAt, new Date(query['dateFrom'] as string)));
  if (query['dateTo']) conditions.push(lte(attendanceLogs.checkInAt, new Date(query['dateTo'] as string)));

  const totalRes = await db.select({ total: count() }).from(attendanceLogs).where(and(...conditions));
  const uniqueRes = await db.select({ unique: sql<number>`COUNT(DISTINCT member_id)`.as('unique') }).from(attendanceLogs).where(and(...conditions));

  const total = totalRes[0]?.total;
  const unique = uniqueRes[0]?.unique;

  const topMembers = await db
    .select({ memberName: attendanceLogs.memberName, visits: count() })
    .from(attendanceLogs).where(and(...conditions))
    .groupBy(attendanceLogs.memberName)
    .orderBy(desc(count()))
    .limit(10);

  return { totalVisits: total ?? 0, uniqueMembers: unique ?? 0, topMembers };
}

// ── Revenue Report ────────────────────────────────────────────────────────────

export async function getRevenueReportService(orgId: string, query: Record<string, unknown>) {
  const conditions: any[] = [eq(paymentTransactions.organizationId, orgId), eq(paymentTransactions.status, 'PAID')];
  if (query['dateFrom']) conditions.push(gte(paymentTransactions.createdAt, new Date(query['dateFrom'] as string)));
  if (query['dateTo']) conditions.push(lte(paymentTransactions.createdAt, new Date(query['dateTo'] as string)));

  const totalRes = await db.select({ total: sum(paymentTransactions.totalAmount) }).from(paymentTransactions).where(and(...conditions));
  const total = totalRes[0]?.total;

  const byMethod = await db
    .select({ method: paymentTransactions.paymentMethod, total: sum(paymentTransactions.totalAmount), count: count() })
    .from(paymentTransactions).where(and(...conditions))
    .groupBy(paymentTransactions.paymentMethod);

  const monthly = await db
    .select({ month: sql<string>`to_char(created_at, 'YYYY-MM')`.as('month'), total: sum(paymentTransactions.totalAmount) })
    .from(paymentTransactions).where(and(...conditions))
    .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
    .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

  return { totalRevenue: parseFloat(total as string ?? '0'), byMethod, monthly };
}

// ── Membership Report ─────────────────────────────────────────────────────────

export async function getMembershipReportService(orgId: string) {
  const activeRes = await db.select({ active: count() }).from(memberMemberships).where(eq(memberMemberships.status, 'ACTIVE'));
  const expiredRes = await db.select({ expired: count() }).from(memberMemberships).where(eq(memberMemberships.status, 'EXPIRED'));
  const frozenRes = await db.select({ frozen: count() }).from(memberMemberships).where(eq(memberMemberships.status, 'FROZEN'));
  const cancelledRes = await db.select({ cancelled: count() }).from(memberMemberships).where(eq(memberMemberships.status, 'CANCELLED'));
  const totalMembersRes = await db.select({ totalMembers: count() }).from(members).where(eq(members.organizationId, orgId));
  return { 
    active: activeRes[0]?.active ?? 0, 
    expired: expiredRes[0]?.expired ?? 0, 
    frozen: frozenRes[0]?.frozen ?? 0, 
    cancelled: cancelledRes[0]?.cancelled ?? 0, 
    totalMembers: totalMembersRes[0]?.totalMembers ?? 0 
  };
}

// ── Trainer Performance Report ────────────────────────────────────────────────

export async function getTrainerPerformanceReportService(orgId: string) {
  const trainerList = await db.select().from(trainers).where(eq(trainers.organizationId, orgId));
  const results = [];
  for (const trainer of trainerList) {
    const sessionsRes = await db.select({ sessions: count() }).from(ptSessions).where(eq(ptSessions.trainerId, trainer.id));
    const completedRes = await db.select({ completed: count() }).from(ptSessions).where(and(eq(ptSessions.trainerId, trainer.id), eq(ptSessions.status, 'COMPLETED')));
    const sessions = sessionsRes[0]?.sessions ?? 0;
    const completed = completedRes[0]?.completed ?? 0;
    results.push({
      id: trainer.id, name: trainer.name, specialization: trainer.specialization, status: trainer.status,
      totalSessions: sessions ?? 0, completedSessions: completed ?? 0,
      completionRate: (sessions ?? 0) > 0 ? Math.round(((completed ?? 0) / (sessions ?? 0)) * 100) : 0,
    });
  }
  return results;
}

// ── PT Sessions Report ────────────────────────────────────────────────────────

export async function getPtSessionsReportService(orgId: string, query: Record<string, unknown>) {
  const conditions: any[] = [eq(ptSessions.organizationId, orgId)];
  if (query['dateFrom']) conditions.push(gte(ptSessions.scheduledAt, new Date(query['dateFrom'] as string)));
  if (query['dateTo']) conditions.push(lte(ptSessions.scheduledAt, new Date(query['dateTo'] as string)));

  const totalRes = await db.select({ total: count() }).from(ptSessions).where(and(...conditions));
  const total = totalRes[0]?.total ?? 0;
  const byStatus = await db
    .select({ status: ptSessions.status, count: count() })
    .from(ptSessions).where(and(...conditions))
    .groupBy(ptSessions.status);

  return { total: total ?? 0, byStatus };
}

// ── Export (Async) ────────────────────────────────────────────────────────────

export async function queueExportService(orgId: string, type: string, format: string, filters: unknown, actorId: string) {
  const [exportJob] = await db.insert(reportExports).values({
    organizationId: orgId,
    type,
    format: format as any,
    status: 'PROCESSING',
    filters: JSON.stringify(filters),
    requestedBy: actorId,
  }).returning();

  // Async: generate CSV in background
  setImmediate(async () => {
    try {
      const csvDir = path.join(path.resolve(config.uploadDir), 'exports');
      if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });

      const filePath = path.join(csvDir, `${exportJob!.id}.csv`);
      let csvContent = 'Report Type,Generated At\n';
      csvContent += `${type},${new Date().toISOString()}\n`;

      fs.writeFileSync(filePath, csvContent, 'utf-8');

      await db.update(reportExports).set({
        status: 'DONE',
        filePath,
        completedAt: new Date(),
      }).where(eq(reportExports.id, exportJob!.id));

      log.info({ exportId: exportJob!.id, type }, 'Export completed');
    } catch (err) {
      log.error({ err, exportId: exportJob!.id }, 'Export failed');
      await db.update(reportExports).set({ status: 'FAILED', errorMessage: String(err) }).where(eq(reportExports.id, exportJob!.id));
    }
  });

  return exportJob;
}

export async function getExportStatusService(orgId: string, exportId: string) {
  const [job] = await db.select().from(reportExports).where(and(eq(reportExports.id, exportId), eq(reportExports.organizationId, orgId))).limit(1);
  if (!job) throw new Error('Export not found');
  return job;
}
