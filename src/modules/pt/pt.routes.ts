import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { ptController } from './pt.controller';

export async function ptRoutes(fastify: FastifyInstance): Promise<void> {
  const authView = [requireAuth, requirePermission('pt.view')];
  const authManage = [requireAuth, requirePermission('pt.manage')];

  fastify.get('/packages', { preHandler: authView, schema: { tags: ['PT'], summary: 'List PT packages' } }, ptController.listPackages);
  fastify.post('/packages', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Create PT package' } }, ptController.createPackage);
  fastify.patch('/packages/:packageId', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Update PT package' } }, ptController.updatePackage);
  fastify.get('/sessions', { preHandler: authView, schema: { tags: ['PT'], summary: 'List PT sessions' } }, ptController.listSessions);
  fastify.get('/sessions/today', { preHandler: authView, schema: { tags: ['PT'], summary: "Today's PT schedule" } }, ptController.todaySessions);
  fastify.post('/sessions', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Book PT session' } }, ptController.bookSession);
  fastify.get('/sessions/:sessionId', { preHandler: authView, schema: { tags: ['PT'], summary: 'PT session detail' } }, ptController.getSession);
  fastify.patch('/sessions/:sessionId', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Update session date/time/notes' } }, ptController.updateSession);
  fastify.post('/sessions/:sessionId/complete', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Mark session complete' } }, ptController.completeSession);
  fastify.post('/sessions/:sessionId/cancel', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Cancel session' } }, ptController.cancelSession);
  fastify.post('/sessions/:sessionId/miss', { preHandler: authManage, schema: { tags: ['PT'], summary: 'Mark session missed' } }, ptController.missSession);
}
