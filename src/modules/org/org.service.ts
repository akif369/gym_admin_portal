import { db } from '../../db/index';
import { organizations, branches, settings } from '../../db/schema/index';
import { eq, and, isNull } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { createLogger } from '../../common/logger/index';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';

const log = createLogger('org-service');

// ── Organization ──────────────────────────────────────────────────────────────

export async function getOrgService(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw AppError.notFound(ErrorCode.ORG_NOT_FOUND, 'Organization not found');
  return org;
}

const orgEditableFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'gstNumber', 'currency', 'timezone'] as const;
const branchEditableFields = ['name', 'address', 'city', 'phone', 'email', 'capacity', 'status'] as const;

function pickFields<T extends object, K extends readonly (keyof T)[]>(data: T, fields: K) {
  return Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, data[field]])) as Partial<Pick<T, K[number]>>;
}

export async function updateOrgService(orgId: string, data: Partial<typeof organizations.$inferInsert>) {
  const [before] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!before) throw AppError.notFound(ErrorCode.ORG_NOT_FOUND, 'Organization not found');

  const [updated] = await db
    .update(organizations)
    .set({ ...pickFields(data, orgEditableFields), updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
  if (!updated) throw AppError.notFound(ErrorCode.ORG_NOT_FOUND, 'Organization not found');
  await auditLog({
    organizationId: orgId,
    action: AuditAction.SETTINGS_UPDATED,
    entityType: 'organization',
    entityId: orgId,
    description: 'Organization profile updated',
    beforeState: before,
    afterState: updated,
  });
  log.info({ orgId }, 'Organization updated');
  return updated;
}

// ── Branches ──────────────────────────────────────────────────────────────────

export async function listBranchesService(orgId: string) {
  return db.select().from(branches).where(eq(branches.organizationId, orgId)).orderBy(branches.name);
}

export async function createBranchService(orgId: string, data: Omit<typeof branches.$inferInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>) {
  const [branch] = await db
    .insert(branches)
    .values({ ...data, organizationId: orgId })
    .returning();
  log.info({ orgId, branchId: branch!.id }, 'Branch created');
  return branch;
}

export async function getBranchService(orgId: string, branchId: string) {
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.organizationId, orgId)))
    .limit(1);
  if (!branch) throw AppError.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found');
  return branch;
}

export async function updateBranchService(orgId: string, branchId: string, data: Partial<typeof branches.$inferInsert>) {
  const before = await getBranchService(orgId, branchId);
  const [updated] = await db
    .update(branches)
    .set({ ...pickFields(data, branchEditableFields), updatedAt: new Date() })
    .where(and(eq(branches.id, branchId), eq(branches.organizationId, orgId)))
    .returning();
  if (!updated) throw AppError.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found');
  await auditLog({
    organizationId: orgId,
    action: AuditAction.SETTINGS_UPDATED,
    entityType: 'branch',
    entityId: branchId,
    description: `Branch settings updated: ${updated.name}`,
    beforeState: before,
    afterState: updated,
  });
  return updated;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettingsService(orgId: string) {
  const allSettings = await db
    .select()
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), isNull(settings.branchId)));

  const settingsMap: Record<string, unknown> = {};
  for (const s of allSettings) {
    settingsMap[s.category] = s.value;
  }
  return settingsMap;
}

export async function isStrictPaymentPolicyEnabled(orgId: string): Promise<boolean> {
  const [setting] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(
      eq(settings.organizationId, orgId),
      eq(settings.category, 'payment-policy'),
      isNull(settings.branchId),
    ))
    .limit(1);

  const value = setting?.value;
  return typeof value === 'object'
    && value !== null
    && 'strictPaymentPolicy' in value
    && value.strictPaymentPolicy === true;
}

export type InvoiceSettings = {
  prefix: string;
  footer: string;
  dueDays: number;
  autoSendOnRenewal: boolean;
};

export async function getInvoiceSettingsService(orgId: string): Promise<InvoiceSettings> {
  const allSettings = await getSettingsService(orgId);
  const value = allSettings['invoice'];
  const invoice = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    prefix: typeof invoice.prefix === 'string' && invoice.prefix.trim() ? invoice.prefix.trim().toUpperCase() : 'GYM',
    footer: typeof invoice.footer === 'string' ? invoice.footer.trim() : '',
    dueDays: typeof invoice.dueDays === 'number' && Number.isInteger(invoice.dueDays) ? invoice.dueDays : 0,
    autoSendOnRenewal: invoice.autoSendOnRenewal !== false,
  };
}

export async function upsertSettingService(
  orgId: string,
  category: string,
  value: unknown,
  updatedBy?: string,
) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Settings value must be an object');
  }

  const settingValue = value as Record<string, unknown>;
  if (category === 'payment-policy') {
    if (!('strictPaymentPolicy' in settingValue) || typeof settingValue.strictPaymentPolicy !== 'boolean') {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Payment policy must include a boolean strictPaymentPolicy value');
    }
    value = { strictPaymentPolicy: settingValue.strictPaymentPolicy };
  } else if (category === 'attendance') {
    const hours = settingValue.autoCheckoutHours;
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1 || hours > 24) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Auto check-out hours must be between 1 and 24');
    }
    if (typeof settingValue.qrCheckIn !== 'boolean' || typeof settingValue.lateCheckoutAlert !== 'boolean') {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Attendance settings must include boolean feature flags');
    }
  } else if (category === 'tax') {
    const taxRate = settingValue.taxRate;
    if (typeof taxRate !== 'number' || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Tax rate must be between 0 and 100');
    }
    if (typeof settingValue.taxIncluded !== 'boolean') {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Tax settings must include taxIncluded');
    }
  } else if (category === 'branch') {
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof settingValue.openingTime !== 'string' || !timePattern.test(settingValue.openingTime)
      || typeof settingValue.closingTime !== 'string' || !timePattern.test(settingValue.closingTime)) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Branch opening and closing times must use HH:mm format');
    }
  } else if (category === 'invoice') {
    const prefix = settingValue.prefix;
    const footer = settingValue.footer;
    const dueDays = settingValue.dueDays;
    const autoSendOnRenewal = settingValue.autoSendOnRenewal;
    if (typeof prefix !== 'string' || !/^[A-Za-z0-9-]{1,20}$/.test(prefix)) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Invoice prefix must contain 1-20 letters, numbers, or hyphens');
    }
    if (typeof footer !== 'string' || footer.length > 500) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Invoice footer must be 500 characters or fewer');
    }
    if (typeof dueDays !== 'number' || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Invoice due days must be a whole number between 0 and 365');
    }
    if (typeof autoSendOnRenewal !== 'boolean') {
      throw AppError.badRequest(ErrorCode.BAD_REQUEST, 'Invoice settings must include autoSendOnRenewal');
    }
    value = { prefix: prefix.toUpperCase(), footer: footer.trim(), dueDays, autoSendOnRenewal };
  }

  // Upsert — update if exists, insert if not
  const existing = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.organizationId, orgId),
        eq(settings.category, category),
        isNull(settings.branchId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const before = existing[0]!;
    await db
      .update(settings)
      .set({ value: value as Record<string, unknown>, updatedBy, updatedAt: new Date() })
      .where(eq(settings.id, existing[0]!.id));
    await auditLog({
      organizationId: orgId,
      actorId: updatedBy,
      action: AuditAction.SETTINGS_UPDATED,
      entityType: 'setting',
      entityId: before.id,
      description: `${category} settings updated`,
      beforeState: before,
      afterState: { ...before, value },
    });
  } else {
    const [created] = await db.insert(settings).values({
      organizationId: orgId,
      category,
      value: value as Record<string, unknown>,
      updatedBy,
    }).returning();
    await auditLog({
      organizationId: orgId,
      actorId: updatedBy,
      action: AuditAction.SETTINGS_UPDATED,
      entityType: 'setting',
      entityId: created?.id,
      description: `${category} settings created`,
      afterState: created,
    });
  }

  log.info({ orgId, category }, 'Setting updated');
  return { category, value };
}
