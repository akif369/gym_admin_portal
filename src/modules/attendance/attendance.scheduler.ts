import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/index';
import { attendanceLogs } from '../../db/schema/attendance.schema';
import { settings } from '../../db/schema/org.schema';
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

/** Closes active sessions that have exceeded each gym's configured limit. */
export async function autoCheckOutSweep() {
  const attendanceSettings = await db
    .select({ organizationId: settings.organizationId, value: settings.value })
    .from(settings)
    .where(and(eq(settings.category, 'attendance'), isNull(settings.branchId)));

  let checkedOut = 0;
  const now = new Date();

  for (const setting of attendanceSettings) {
    const hours = getAutoCheckoutHours(setting.value);
    if (hours === null) continue;

    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const expiredSessions = await db
      .select({ id: attendanceLogs.id, memberName: attendanceLogs.memberName })
      .from(attendanceLogs)
      .where(and(
        eq(attendanceLogs.organizationId, setting.organizationId),
        isNull(attendanceLogs.checkOutAt),
        lte(attendanceLogs.checkInAt, cutoff),
      ));

    for (const session of expiredSessions) {
      // The NULL condition makes the sweep safe if a staff checkout races with it.
      const [updated] = await db
        .update(attendanceLogs)
        .set({ checkOutAt: new Date(), updatedAt: new Date() })
        .where(and(eq(attendanceLogs.id, session.id), isNull(attendanceLogs.checkOutAt)))
        .returning({ id: attendanceLogs.id });

      if (!updated) continue;
      checkedOut += 1;
      await auditLog({
        organizationId: setting.organizationId,
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
