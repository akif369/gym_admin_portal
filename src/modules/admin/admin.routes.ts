import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { adminController } from './admin.controller';
import { AppError, ErrorCode } from '../../common/errors/AppError';

// Middleware specific to Super Admin
async function requireSuperAdmin(req: any) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    throw AppError.forbidden(ErrorCode.FORBIDDEN, 'Super Admin access required');
  }
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const adminAuth = [requireAuth, requireSuperAdmin];

  fastify.post(
    '/login',
    { schema: { tags: ['Admin'], summary: 'Super admin login' } },
    adminController.login as any
  );

  fastify.get(
    '/stats',
    { preHandler: adminAuth, schema: { tags: ['Admin'], summary: 'Get global stats' } },
    adminController.getStats as any
  );

  fastify.get(
    '/organizations',
    { preHandler: adminAuth, schema: { tags: ['Admin'], summary: 'List all organizations' } },
    adminController.getOrganizations as any
  );

  fastify.patch(
    '/organizations/:orgId/status',
    { preHandler: adminAuth, schema: { tags: ['Admin'], summary: 'Update organization status' } },
    adminController.updateOrganizationStatus as any
  );
}
