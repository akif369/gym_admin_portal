import { db } from '../../db/index';
import { organizations, branches, settings } from '../../db/schema/index';
import { eq, and, isNull } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/AppError';
import { createLogger } from '../../common/logger/index';

const log = createLogger('org-service');

// ── Organization ──────────────────────────────────────────────────────────────

export async function getOrgService(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw AppError.notFound(ErrorCode.ORG_NOT_FOUND, 'Organization not found');
  return org;
}

export async function updateOrgService(orgId: string, data: Partial<typeof organizations.$inferInsert>) {
  const [updated] = await db
    .update(organizations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
  if (!updated) throw AppError.notFound(ErrorCode.ORG_NOT_FOUND, 'Organization not found');
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
  const [updated] = await db
    .update(branches)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(branches.id, branchId), eq(branches.organizationId, orgId)))
    .returning();
  if (!updated) throw AppError.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found');
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

export async function upsertSettingService(
  orgId: string,
  category: string,
  value: unknown,
  updatedBy?: string,
) {
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
    await db
      .update(settings)
      .set({ value: value as Record<string, unknown>, updatedBy, updatedAt: new Date() })
      .where(eq(settings.id, existing[0]!.id));
  } else {
    await db.insert(settings).values({
      organizationId: orgId,
      category,
      value: value as Record<string, unknown>,
      updatedBy,
    });
  }

  log.info({ orgId, category }, 'Setting updated');
  return { category, value };
}
