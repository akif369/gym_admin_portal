import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  getAttendanceReportService, getRevenueReportService, getMembershipReportService,
  getTrainerPerformanceReportService, getPtSessionsReportService,
  queueExportService, getExportStatusService,
} from './reports.service';
import * as fs from 'fs';
import { AppError, ErrorCode } from '../../common/errors/AppError';

export const reportsController = {
  async attendance(req: FastifyRequest, reply: FastifyReply) { return reply.send(await getAttendanceReportService(req.user.orgId, req.query as any)); },
  async revenue(req: FastifyRequest, reply: FastifyReply) { return reply.send(await getRevenueReportService(req.user.orgId, req.query as any)); },
  async memberships(req: FastifyRequest, reply: FastifyReply) { return reply.send(await getMembershipReportService(req.user.orgId)); },
  async trainerPerformance(req: FastifyRequest, reply: FastifyReply) { return reply.send({ trainers: await getTrainerPerformanceReportService(req.user.orgId) }); },
  async ptSessions(req: FastifyRequest, reply: FastifyReply) { return reply.send(await getPtSessionsReportService(req.user.orgId, req.query as any)); },
  async queueExport(req: FastifyRequest, reply: FastifyReply) {
    const { type, format, filters } = req.body as any;
    const job = await queueExportService(req.user.orgId, type, format ?? 'CSV', filters, req.user.userId);
    return reply.status(202).send({ export: job });
  },
  async exportStatus(req: FastifyRequest<{ Params: { exportId: string } }>, reply: FastifyReply) {
    const job = await getExportStatusService(req.user.orgId, req.params.exportId);
    return reply.send({ export: job });
  },
  async downloadExport(req: FastifyRequest<{ Params: { exportId: string } }>, reply: FastifyReply) {
    const job = await getExportStatusService(req.user.orgId, req.params.exportId);
    if (job.status !== 'DONE' || !job.filePath) {
      throw AppError.badRequest(ErrorCode.EXPORT_NOT_READY, 'Export is not ready for download');
    }
    if (!fs.existsSync(job.filePath)) {
      throw AppError.notFound(ErrorCode.EXPORT_NOT_FOUND, 'Export file not found');
    }
    const fileContent = fs.readFileSync(job.filePath, 'utf-8');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="export-${req.params.exportId}.csv"`);
    return reply.send(fileContent);
  },
};
