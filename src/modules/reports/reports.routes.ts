import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { reportsController } from './reports.controller';

export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  const authView = [requireAuth, requirePermission('report.view')];
  const authExport = [requireAuth, requirePermission('report.export')];

  fastify.get('/attendance', { preHandler: authView, schema: { tags: ['Reports'], summary: 'Attendance report' } }, reportsController.attendance);
  fastify.get('/revenue', { preHandler: authView, schema: { tags: ['Reports'], summary: 'Revenue report' } }, reportsController.revenue);
  fastify.get('/memberships', { preHandler: authView, schema: { tags: ['Reports'], summary: 'Membership status report' } }, reportsController.memberships);
  fastify.get('/trainers/performance', { preHandler: authView, schema: { tags: ['Reports'], summary: 'Trainer performance report' } }, reportsController.trainerPerformance);
  fastify.get('/pt-sessions', { preHandler: authView, schema: { tags: ['Reports'], summary: 'PT sessions report' } }, reportsController.ptSessions);
  fastify.post('/export', { preHandler: authExport, schema: { tags: ['Reports'], summary: 'Queue CSV/PDF export job' } }, reportsController.queueExport);
  fastify.get('/exports/:exportId', { preHandler: authExport, schema: { tags: ['Reports'], summary: 'Export job status' } }, reportsController.exportStatus);
  fastify.get('/exports/:exportId/download', { preHandler: authExport, schema: { tags: ['Reports'], summary: 'Download generated export' } }, reportsController.downloadExport);
}
