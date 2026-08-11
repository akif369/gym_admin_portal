import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { users } from './auth.schema';

// ── Staff Audit Logs (Immutable) ──────────────────────────────────────────────

export const staffAuditLogs = pgTable('staff_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id),
  actorEmail: text('actor_email'), // denormalized for immutability
  actorRole: text('actor_role'), // denormalized
  entityType: text('entity_type').notNull(), // 'member' | 'payment' | 'attendance' | etc.
  entityId: uuid('entity_id'),
  action: text('action').notNull(), // 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | etc.
  description: text('description'),
  beforeState: jsonb('before_state'), // snapshot before change
  afterState: jsonb('after_state'), // snapshot after change
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  requestId: text('request_id'), // correlation ID
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type StaffAuditLog = typeof staffAuditLogs.$inferSelect;
export type NewStaffAuditLog = typeof staffAuditLogs.$inferInsert;

// ── Audit Action Constants ─────────────────────────────────────────────────────

export const AuditAction = {
  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',

  // Members
  MEMBER_CREATED: 'MEMBER_CREATED',
  MEMBER_UPDATED: 'MEMBER_UPDATED',
  MEMBER_STATUS_CHANGED: 'MEMBER_STATUS_CHANGED',
  MEMBER_DELETED: 'MEMBER_DELETED',
  MEMBER_PHOTO_UPLOADED: 'MEMBER_PHOTO_UPLOADED',

  // Memberships
  MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
  MEMBERSHIP_ACTIVATED: 'MEMBERSHIP_ACTIVATED',
  MEMBERSHIP_RENEWED: 'MEMBERSHIP_RENEWED',
  MEMBERSHIP_UPGRADED: 'MEMBERSHIP_UPGRADED',
  MEMBERSHIP_DOWNGRADED: 'MEMBERSHIP_DOWNGRADED',
  MEMBERSHIP_FROZEN: 'MEMBERSHIP_FROZEN',
  MEMBERSHIP_RESUMED: 'MEMBERSHIP_RESUMED',
  MEMBERSHIP_EXTENDED: 'MEMBERSHIP_EXTENDED',
  MEMBERSHIP_CANCELLED: 'MEMBERSHIP_CANCELLED',
  MEMBERSHIP_TRANSFERRED: 'MEMBERSHIP_TRANSFERRED',

  // Attendance
  ATTENDANCE_CHECKED_IN: 'ATTENDANCE_CHECKED_IN',
  ATTENDANCE_CHECKED_OUT: 'ATTENDANCE_CHECKED_OUT',
  ATTENDANCE_CORRECTED: 'ATTENDANCE_CORRECTED',

  // Payments
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',
  INVOICE_WHATSAPP_QUEUED: 'INVOICE_WHATSAPP_QUEUED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  MESSAGE_FAILED: 'MESSAGE_FAILED',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',

  // Staff
  STAFF_CREATED: 'STAFF_CREATED',
  STAFF_UPDATED: 'STAFF_UPDATED',
  STAFF_DEACTIVATED: 'STAFF_DEACTIVATED',
  PERMISSIONS_UPDATED: 'PERMISSIONS_UPDATED',

  // Settings
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',

  // Leads
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
