import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { staffController } from './staff.controller';

export async function staffRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', {
    preHandler: [requireAuth, requirePermission('staff.view')],
    schema: { tags: ['Staff'], summary: 'List staff members (paginated)' },
  }, staffController.list);

  fastify.post('/', {
    preHandler: [requireAuth, requirePermission('staff.manage')],
    schema: {
      tags: ['Staff'],
      summary: 'Create staff member',
      body: {
        type: 'object',
        required: ['email', 'firstName', 'lastName', 'role', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'] },
          branchId: { type: 'string', format: 'uuid' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, staffController.create);

  fastify.get('/:staffId', {
    preHandler: [requireAuth, requirePermission('staff.view')],
    schema: { tags: ['Staff'], summary: 'Get staff member detail' },
  }, staffController.getOne);

  fastify.patch('/:staffId', {
    preHandler: [
      requireAuth,
      async (request, reply) => {
        const { staffId } = request.params as { staffId: string };
        // Allow users to edit their own profile without 'staff.manage' permission
        if (request.user.userId === staffId) return;
        return requirePermission('staff.manage')(request, reply);
      },
    ],
    schema: { tags: ['Staff'], summary: 'Update staff profile' },
  }, staffController.update);

  fastify.patch('/:staffId/status', {
    preHandler: [requireAuth, requirePermission('staff.manage')],
    schema: {
      tags: ['Staff'],
      summary: 'Activate or deactivate staff',
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] } },
      },
    },
  }, staffController.updateStatus);

  fastify.patch('/:staffId/permissions', {
    preHandler: [requireAuth, requirePermission('staff.manage')],
    schema: { tags: ['Staff'], summary: 'Override staff permissions' },
  }, staffController.updatePermissions);

  fastify.get('/roles', {
    preHandler: [requireAuth],
    schema: { tags: ['Staff'], summary: 'List system roles' },
  }, staffController.getRoles);

  fastify.get('/permissions', {
    preHandler: [requireAuth],
    schema: { tags: ['Staff'], summary: 'List all system permissions' },
  }, staffController.getPermissions);

  fastify.get('/audit-logs', {
    preHandler: [requireAuth, requirePermission('staff.manage')],
    schema: { tags: ['Staff'], summary: 'Staff activity audit log' },
  }, staffController.getAuditLogs);
}
