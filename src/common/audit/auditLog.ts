import { db } from '../../db/index';
import { staffAuditLogs } from '../../db/schema/audit.schema';
import type { AuditActionType } from '../../db/schema/audit.schema';
import { createLogger } from '../logger/index';

const log = createLogger('audit');

export interface AuditLogParams {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string;
  actorRole?: string;
  entityType: string;
  entityId?: string | null;
  action: AuditActionType;
  description?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// ── Write Audit Log ───────────────────────────────────────────────────────────

export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await db.insert(staffAuditLogs).values({
      organizationId: params.organizationId,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      description: params.description,
      beforeState: params.beforeState ? params.beforeState : undefined,
      afterState: params.afterState ? params.afterState : undefined,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });
  } catch (err) {
    // Audit log failures must never crash the main flow
    log.error({ err, params }, 'Failed to write audit log');
  }
}

// ── Extract audit context from request ────────────────────────────────────────

export interface AuditContext {
  organizationId: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

import type { FastifyRequest } from 'fastify';

export function getAuditContext(request: FastifyRequest): AuditContext {
  const user = (request as any).user;
  return {
    organizationId: user?.orgId ?? '',
    actorId: user?.userId,
    actorEmail: user?.email,
    actorRole: user?.role,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id as string,
  };
}
