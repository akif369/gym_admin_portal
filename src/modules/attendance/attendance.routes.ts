import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { attendanceController } from './attendance.controller';

export async function attendanceRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [requireAuth, requirePermission('attendance.view')];
  const authCreate = [requireAuth, requirePermission('attendance.create')];
  const authCorrect = [requireAuth, requirePermission('attendance.correct')];

  fastify.get('/', { preHandler: auth, schema: { tags: ['Attendance'], summary: 'List attendance logs' } }, attendanceController.list);
  fastify.get('/currently-inside', { preHandler: auth, schema: { tags: ['Attendance'], summary: 'Live occupancy list' } }, attendanceController.currentlyInside);
  fastify.post('/check-in', { preHandler: authCreate, schema: { tags: ['Attendance'], summary: 'Manual check-in' } }, attendanceController.checkIn);
  fastify.post('/check-in/qr', { preHandler: authCreate, schema: { tags: ['Attendance'], summary: 'QR-based check-in' } }, attendanceController.checkInQr);
  fastify.post('/check-in/rfid', { preHandler: authCreate, schema: { tags: ['Attendance'], summary: 'RFID-based check-in' } }, attendanceController.checkInRfid);
  fastify.post('/check-out', { preHandler: authCreate, schema: { tags: ['Attendance'], summary: 'Check out a member' } }, attendanceController.checkOut);
  fastify.post('/correct', { preHandler: authCorrect, schema: { tags: ['Attendance'], summary: 'Correct historical attendance entry' } }, attendanceController.correct);
  fastify.get('/analytics/peak-hours', { preHandler: auth, schema: { tags: ['Attendance'], summary: 'Peak hour analytics' } }, attendanceController.peakHours);
  fastify.get('/analytics/daily', { preHandler: auth, schema: { tags: ['Attendance'], summary: 'Daily attendance trends' } }, attendanceController.daily);

  // Member-specific attendance (registered under /members prefix in members routes)
  fastify.get('/members/:memberId', { preHandler: auth, schema: { tags: ['Attendance'], summary: 'Member attendance history' } }, attendanceController.memberHistory);
}
