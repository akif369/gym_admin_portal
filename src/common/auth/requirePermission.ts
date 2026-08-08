import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ErrorCode } from '../errors/AppError';

// ── Permission Guard Factory ───────────────────────────────────────────────────

/**
 * Returns a Fastify preHandler that checks if the authenticated user
 * has ALL of the specified permissions.
 *
 * @example
 * fastify.post('/payments', { preHandler: [requireAuth, requirePermission('payment.create')] }, handler)
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      const err = AppError.unauthorized(ErrorCode.UNAUTHORIZED, 'Authentication required');
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: request.id },
      });
      return;
    }

    // OWNER bypasses all permission checks
    if (user.role === 'OWNER') return;

    const userPerms = new Set(user.permissions);
    const missing = requiredPermissions.filter((p) => !userPerms.has(p));

    if (missing.length > 0) {
      const err = AppError.forbidden(
        ErrorCode.FORBIDDEN,
        `Insufficient permissions. Required: ${missing.join(', ')}`,
      );
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: request.id },
      });
    }
  };
};

// ── Role Guard Factory ─────────────────────────────────────────────────────────

/**
 * Returns a Fastify preHandler that checks if the authenticated user
 * has one of the specified roles.
 */
export const requireRole = (...roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      const err = AppError.unauthorized(ErrorCode.UNAUTHORIZED, 'Authentication required');
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: request.id },
      });
      return;
    }

    if (!roles.includes(user.role)) {
      const err = AppError.forbidden(
        ErrorCode.FORBIDDEN,
        `This action requires one of these roles: ${roles.join(', ')}`,
      );
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: request.id },
      });
    }
  };
};
