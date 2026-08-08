import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ErrorCode } from '../errors/AppError';
import { db } from '../../db/index';
import { users, userSessions } from '../../db/schema/index';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { DEFAULT_ROLE_PERMISSIONS } from '../../db/schema/rbac.schema';

// ── JWT Payload Type ──────────────────────────────────────────────────────────

export interface JwtAccessPayload {
  userId: string;
  email: string;
  role: string;
  orgId: string;
  branchId?: string | null;
  sessionId: string;
}

// Augmentation moved to fastify.d.ts

// ── requireAuth Prehandler ────────────────────────────────────────────────────

export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  try {
    // Verifies the JWT signature and decodes the payload
    const decoded = await request.jwtVerify<JwtAccessPayload>();

    // ── Super Admin Bypass ───────────────────────────────────────────────────
    if (decoded.role === 'SUPER_ADMIN') {
      request.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        orgId: decoded.orgId,
        branchId: decoded.branchId,
        sessionId: decoded.sessionId,
        permissions: ['*'], // Super Admin has implicit global permissions
      };
      return;
    }

    // Validate the session still exists and is not revoked
    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, decoded.sessionId),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      throw AppError.unauthorized(ErrorCode.SESSION_REVOKED, 'Session has been revoked or expired');
    }

    // Fetch user status
    const [user] = await db
      .select({
        id: users.id,
        status: users.status,
        role: users.role,
        organizationId: users.organizationId,
        branchId: users.branchId,
      })
      .from(users)
      .where(and(eq(users.id, decoded.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw AppError.unauthorized(ErrorCode.UNAUTHORIZED, 'User not found');
    }

    if (user.status === 'INACTIVE') {
      throw AppError.unauthorized(ErrorCode.ACCOUNT_INACTIVE, 'Account is deactivated');
    }

    // Resolve permissions (role defaults for now — per-user overrides checked separately)
    const permissions = DEFAULT_ROLE_PERMISSIONS[user.role] ?? [];

    // Attach to request
    request.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: user.role,
      orgId: user.organizationId,
      branchId: user.branchId,
      sessionId: decoded.sessionId,
      permissions,
    };
  } catch (err) {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: request.id },
      });
      return;
    }
    // JWT verification error
    reply.status(401).send({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid or expired access token',
        requestId: request.id,
      },
    });
  }
};

// ── optionalAuth — Attaches user if token present, does not reject ────────────

export const optionalAuth = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;

  try {
    await requireAuth(request, _reply);
  } catch {
    // silently ignore
  }
};
