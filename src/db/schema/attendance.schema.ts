import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { branches } from './org.schema';
import { members } from './members.schema';
import { users } from './auth.schema';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const checkInMethodEnum = pgEnum('check_in_method', [
  'MANUAL',
  'QR',
  'RFID',
  'APP',
]);

// ── Attendance Logs ───────────────────────────────────────────────────────────

export const attendanceLogs = pgTable('attendance_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  memberName: text('member_name').notNull(), // denormalized for performance
  checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull(),
  checkOutAt: timestamp('check_out_at', { withTimezone: true }),
  checkInMethod: checkInMethodEnum('check_in_method').notNull().default('MANUAL'),
  checkInBy: uuid('check_in_by').references(() => users.id), // staff who did the check-in
  checkOutBy: uuid('check_out_by').references(() => users.id),
  notes: text('notes'),
  correctedAt: timestamp('corrected_at', { withTimezone: true }),
  correctedBy: uuid('corrected_by').references(() => users.id),
  correctionReason: text('correction_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;
