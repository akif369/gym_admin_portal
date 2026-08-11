import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { notificationsController } from './notifications.controller';

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/messages/text', {
    preHandler: [requireAuth, requirePermission('member.update')],
    schema: { tags: ['Messages'], summary: 'Send a text message through Evolution Go' },
  }, notificationsController.sendText);
}
