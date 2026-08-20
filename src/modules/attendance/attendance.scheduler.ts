import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/index';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { settings, branches, organizations } from '../../db/schema/org.schema';
import { getSettingsService } from '../org/org.service';
import { auditLog } from '../../common/audit/auditLog';
import { AuditAction } from '../../db/schema/audit.schema';
import { createLogger } from '../../common/logger/index';
import { config } from '../../config/env';

const log = createLogger('attendance-auto-checkout-scheduler');

function getAutoCheckoutHours(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const hours = (value as Record<string, unknown>).autoCheckoutHours;
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 1 && hours <= 24 ? hours : null;
}

export async function autoCheckOutSweep() {
  const allBranches = await db.select({ id: branches.id, organizationId: branches.organizationId }).from(branches);
  
  let checkedOut = 0;
  const now = new Date();

  for (const branch of allBranches) {
    const settingsMap = await getSettingsService(branch.organizationId, branch.id);
    const value = settingsMap['attendance'];
    const hours = getAutoCheckoutHours(value);
    if (hours === null) continue;

    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const expiredSessions = await db
      .select({ id: attendanceLogs.id, memberName: attendanceLogs.memberName })
      .from(attendanceLogs)
      .where(and(
        eq(attendanceLogs.organizationId, branch.organizationId),
        eq(attendanceLogs.branchId, branch.id),
        isNull(attendanceLogs.checkOutAt),
        lte(attendanceLogs.checkInAt, cutoff),
      ));

    for (const session of expiredSessions) {
      const [updated] = await db
        .update(attendanceLogs)
        .set({ checkOutAt: new Date(), updatedAt: new Date() })
        .where(and(eq(attendanceLogs.id, session.id), isNull(attendanceLogs.checkOutAt)))
        .returning({ id: attendanceLogs.id });

      if (!updated) continue;
      checkedOut += 1;
      await auditLog({
        organizationId: branch.organizationId,
        action: AuditAction.ATTENDANCE_CHECKED_OUT,
        entityType: 'attendance',
        entityId: session.id,
        description: `${session.memberName} automatically checked out after ${hours} hours`,
      });
    }
  }

  // Fallback for any attendance logs with no branch assigned
  const allOrgs = await db.select({ id: organizations.id }).from(organizations);
  for (const org of allOrgs) {
    const settingsMap = await getSettingsService(org.id);
    const value = settingsMap['attendance'];
    const hours = getAutoCheckoutHours(value);
    if (hours === null) continue;

    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const expiredSessions = await db
      .select({ id: attendanceLogs.id, memberName: attendanceLogs.memberName })
      .from(attendanceLogs)
      .where(and(
        eq(attendanceLogs.organizationId, org.id),
        isNull(attendanceLogs.branchId),
        isNull(attendanceLogs.checkOutAt),
        lte(attendanceLogs.checkInAt, cutoff),
      ));

    for (const session of expiredSessions) {
      const [updated] = await db
        .update(attendanceLogs)
        .set({ checkOutAt: new Date(), updatedAt: new Date() })
        .where(and(eq(attendanceLogs.id, session.id), isNull(attendanceLogs.checkOutAt)))
        .returning({ id: attendanceLogs.id });

      if (!updated) continue;
      checkedOut += 1;
      await auditLog({
        organizationId: org.id,
        action: AuditAction.ATTENDANCE_CHECKED_OUT,
        entityType: 'attendance',
        entityId: session.id,
        description: `${session.memberName} automatically checked out after ${hours} hours`,
      });
    }
  }

  if (checkedOut > 0) log.info({ checkedOut }, 'Automatic attendance check-outs processed');
  return { checkedOut };
}

export function startAttendanceAutoCheckoutScheduler() {
  const run = async () => {
    try {
      await autoCheckOutSweep();
    } catch (error) {
      log.error({ err: error }, 'Automatic attendance check-out sweep failed');
    }
  };

  void run();
  const timer = setInterval(() => void run(), config.attendanceAutoCheckoutSweepIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
