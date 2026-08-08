import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser } from '../../types/fastify.d';

// Re-export AuthUser for convenience
export type { AuthUser };

// Helper to get typed user from request
export function getUser(req: FastifyRequest): AuthUser {
  return (req as any).user as AuthUser;
}
