import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { messageDeliveries } from '../../db/schema/notifications.schema';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { config } from '../../config/env';
import { createLogger } from '../../common/logger/index';

const log = createLogger('notifications-service');

type SendTextInput = {
  organizationId: string;
  memberId?: string;
  invoiceId?: string;
  eventType: 'INVOICE' | 'MEMBERSHIP_RENEWED' | 'MEMBERSHIP_EXPIRED' | 'MANUAL';
  phone: string;
  text: string;
  idempotencyKey: string;
  actorId?: string;
};

function maskPhone(phone: string) {
  if (phone.length <= 4) return '****';
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

function normalizePhone(phone: string): string {
  let normalized = phone.trim().replace(/[^\d+]/g, '');
  if (normalized.startsWith('+')) normalized = normalized.slice(1);
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.length === 10) normalized = `${config.evolutionGo.defaultCountryCode}${normalized}`;
  if (!/^\d{8,15}$/.test(normalized)) {
    throw new Error('The member phone number must contain a valid international number');
  }
  return normalized;
}

function providerMessageId(payload: string): string | undefined {
  try {
    const data = JSON.parse(payload) as Record<string, unknown>;
    const key = data['key'];
    if (typeof key === 'object' && key !== null && 'id' in key && typeof key.id === 'string') return key.id;
    return typeof data['messageId'] === 'string' ? data.messageId : undefined;
  } catch {
    return undefined;
  }
}

export async function sendTextMessage(input: SendTextInput) {
  const recipient = normalizePhone(input.phone);
  const [existing] = await db
    .select()
    .from(messageDeliveries)
    .where(and(
      eq(messageDeliveries.organizationId, input.organizationId),
      eq(messageDeliveries.idempotencyKey, input.idempotencyKey),
    ))
    .limit(1);

  if (existing) return { ...existing, recipient: maskPhone(existing.recipient), alreadyProcessed: true };

  const configured = config.evolutionGo.enabled && Boolean(config.evolutionGo.endpoint);
  const [delivery] = await db.insert(messageDeliveries).values({
    organizationId: input.organizationId,
    memberId: input.memberId,
    invoiceId: input.invoiceId,
    eventType: input.eventType,
    recipient,
    message: input.text,
    provider: configured ? 'EVOLUTION_GO' : 'NOT_CONFIGURED',
    status: configured ? 'PENDING' : 'SKIPPED',
    idempotencyKey: input.idempotencyKey,
  }).returning();

  if (!configured) {
    log.warn({ eventType: input.eventType, recipient: maskPhone(recipient) }, 'Message skipped because Evolution Go is not configured');
    return { ...delivery!, recipient: maskPhone(recipient) };
  }

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.evolutionGo.apiKey) headers['apikey'] = config.evolutionGo.apiKey;

    const response = await fetch(config.evolutionGo.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: recipient, text: input.text }),
      signal: AbortSignal.timeout(config.evolutionGo.timeoutMs),
    });
    const payload = await response.text();

    if (!response.ok) throw new Error(`Evolution Go returned HTTP ${response.status}`);

    const [sent] = await db.update(messageDeliveries)
      .set({
        status: 'SENT',
        providerMessageId: providerMessageId(payload),
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messageDeliveries.id, delivery!.id))
      .returning();

    await auditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: AuditAction.MESSAGE_SENT,
      entityType: 'message_delivery',
      entityId: delivery!.id,
      description: `${input.eventType} text sent through Evolution Go`,
      afterState: { status: 'SENT', provider: 'EVOLUTION_GO', recipient: maskPhone(recipient) },
    });
    return { ...sent!, recipient: maskPhone(recipient) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Evolution Go request failed';
    const [failed] = await db.update(messageDeliveries)
      .set({ status: 'FAILED', errorMessage, updatedAt: new Date() })
      .where(eq(messageDeliveries.id, delivery!.id))
      .returning();

    await auditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: AuditAction.MESSAGE_FAILED,
      entityType: 'message_delivery',
      entityId: delivery!.id,
      description: `${input.eventType} text delivery failed`,
      afterState: { status: 'FAILED', provider: 'EVOLUTION_GO', recipient: maskPhone(recipient) },
    });
    log.error({ err: error, eventType: input.eventType, recipient: maskPhone(recipient) }, 'Evolution Go text delivery failed');
    return { ...failed!, recipient: maskPhone(recipient) };
  }
}
