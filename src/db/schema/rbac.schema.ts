import { pgTable, uuid, text, timestamp, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { users } from './auth.schema';

// ── Roles ─────────────────────────────────────────────────────────────────────

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  key: text('key').notNull(), // 'ORGANIZATION_OWNER' | 'BRANCH_OWNER' | 'BRANCH_MANAGER' | etc.
  name: text('name').notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default('[]'), // string[]
  isSystem: boolean('is_system').notNull().default(false), // system roles can't be deleted
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('roles_org_key_unique').on(table.organizationId, table.key),
]);

// ── User Permission Overrides ─────────────────────────────────────────────────
// Per-user permission overrides on top of role defaults

export const userPermissions = pgTable('user_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permissions: jsonb('permissions').notNull().default('[]'), // string[] — full override
  grantedBy: uuid('granted_by').references(() => users.id),
  reason: text('reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferSelect;
export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;

// ── System Permission Registry ────────────────────────────────────────────────

export const SYSTEM_PERMISSIONS = [
  // ── Member management ──────────────────────────────────────────────────────
  'member.view',
  'member.create',
  'member.update',
  'member.delete',
  'member.export',

  // ── Attendance ─────────────────────────────────────────────────────────────
  'attendance.view',
  'attendance.create',
  'attendance.correct',
  'attendance.analytics',

  // ── Payments & Finance ─────────────────────────────────────────────────────
  'payment.view',
  'payment.create',
  'payment.refund',
  'revenue.view',
  'invoice.view',
  'invoice.generate',
  'finance.manage',       // full financial management (reconcile, adjust)

  // ── Trainers ───────────────────────────────────────────────────────────────
  'trainer.view',
  'trainer.manage',

  // ── Personal Training ─────────────────────────────────────────────────────
  'pt.view',
  'pt.manage',

  // ── Leads & CRM ───────────────────────────────────────────────────────────
  'lead.view',
  'lead.manage',
  'lead.convert',

  // ── Workouts ──────────────────────────────────────────────────────────────
  'workout.view',
  'workout.manage',

  // ── Reports ───────────────────────────────────────────────────────────────
  'report.view',
  'report.export',

  // ── Staff management ──────────────────────────────────────────────────────
  'staff.view',
  'staff.manage',
  'staff.invite',

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.view',
  'settings.manage',

  // ── Branch management ─────────────────────────────────────────────────────
  'branch.view',
  'branch.manage',

  // ── Organization (chain-wide) ─────────────────────────────────────────────
  'org.view',
  'org.manage',
  'org.financials',       // access to full P&L and salary data across all branches

  // ── Member self-service (member portal) ───────────────────────────────────
  'member.self',          // access to own profile, membership, attendance, invoices
] as const;

export type Permission = (typeof SYSTEM_PERMISSIONS)[number];

// ── Default Role Permissions ──────────────────────────────────────────────────

const ALL_PERMISSIONS = SYSTEM_PERMISSIONS as unknown as string[];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {

  // ── Organization Owner ─────────────────────────────────────────────────────
  // Full access to everything: all branches, all financials, all staff
  ORGANIZATION_OWNER: ALL_PERMISSIONS,

  // Legacy alias — same as ORGANIZATION_OWNER
  OWNER: ALL_PERMISSIONS,

  // ── Branch Owner ──────────────────────────────────────────────────────────
  // Full access to their branch + P&L; cannot manage other branches or org settings
  BRANCH_OWNER: [
    'member.view', 'member.create', 'member.update', 'member.delete', 'member.export',
    'attendance.view', 'attendance.create', 'attendance.correct', 'attendance.analytics',
    'payment.view', 'payment.create', 'payment.refund',
    'revenue.view', 'invoice.view', 'invoice.generate', 'finance.manage',
    'trainer.view', 'trainer.manage',
    'pt.view', 'pt.manage',
    'lead.view', 'lead.manage', 'lead.convert',
    'workout.view', 'workout.manage',
    'report.view', 'report.export',
    'staff.view', 'staff.manage', 'staff.invite',
    'settings.view', 'settings.manage',
    'branch.view', 'branch.manage',
    'org.financials',
  ],

  // ── Branch Manager ────────────────────────────────────────────────────────
  // Full day-to-day operations; no P&L / salary data; cannot delete members or manage branch itself
  BRANCH_MANAGER: [
    'member.view', 'member.create', 'member.update', 'member.export',
    'attendance.view', 'attendance.create', 'attendance.correct', 'attendance.analytics',
    'payment.view', 'payment.create', 'payment.refund',
    'revenue.view', 'invoice.view', 'invoice.generate',
    'trainer.view', 'trainer.manage',
    'pt.view', 'pt.manage',
    'lead.view', 'lead.manage', 'lead.convert',
    'workout.view', 'workout.manage',
    'report.view', 'report.export',
    'staff.view', 'staff.manage',
    'settings.view',
    'branch.view',
  ],

  // Legacy alias — same as BRANCH_MANAGER
  MANAGER: [
    'member.view', 'member.create', 'member.update', 'member.export',
    'attendance.view', 'attendance.create', 'attendance.correct', 'attendance.analytics',
    'payment.view', 'payment.create', 'payment.refund',
    'revenue.view', 'invoice.view', 'invoice.generate',
    'trainer.view', 'trainer.manage',
    'pt.view', 'pt.manage',
    'lead.view', 'lead.manage', 'lead.convert',
    'workout.view', 'workout.manage',
    'report.view', 'report.export',
    'staff.view',
    'settings.view',
    'branch.view',
  ],

  // ── Receptionist / Front Desk ─────────────────────────────────────────────
  // Check-in/out, walk-in payments, member lookup, basic lead capture
  RECEPTIONIST: [
    'member.view', 'member.create',
    'attendance.view', 'attendance.create',
    'payment.view', 'payment.create',
    'invoice.view',
    'pt.view',
    'lead.view', 'lead.manage',
    'trainer.view',
  ],

  // ── Sales Staff ───────────────────────────────────────────────────────────
  // Leads pipeline, conversions, trial follow-ups; limited financial view
  SALES_STAFF: [
    'member.view', 'member.create',
    'lead.view', 'lead.manage', 'lead.convert',
    'payment.view', 'payment.create',
    'invoice.view',
    'attendance.view',
    'trainer.view',
    'pt.view',
  ],

  // ── Accountant ────────────────────────────────────────────────────────────
  // Read-heavy financial role: revenue, invoices, refunds, reconciliation
  ACCOUNTANT: [
    'payment.view', 'payment.create', 'payment.refund',
    'revenue.view', 'invoice.view', 'invoice.generate', 'finance.manage',
    'member.view',
    'report.view', 'report.export',
    'attendance.view',
  ],

  // ── Trainer ───────────────────────────────────────────────────────────────
  // PT sessions, assigned clients only, workout template management
  TRAINER: [
    'member.view',
    'attendance.view',
    'pt.view', 'pt.manage',
    'workout.view', 'workout.manage',
  ],

  // ── Member (self-service portal) ──────────────────────────────────────────
  // Read-only access to own data only
  MEMBER: [
    'member.self',
  ],
};

// ── Role Display Metadata ─────────────────────────────────────────────────────

export const ROLE_METADATA: Record<string, { label: string; description: string; color: string }> = {
  ORGANIZATION_OWNER: {
    label: 'Organization Owner',
    description: 'Full access to all branches, financials, and org settings',
    color: '#f59e0b',
  },
  BRANCH_OWNER: {
    label: 'Branch Owner',
    description: 'Full access to assigned branch including P&L',
    color: '#8b5cf6',
  },
  BRANCH_MANAGER: {
    label: 'Branch Manager',
    description: 'Day-to-day branch operations and staff management',
    color: '#3b82f6',
  },
  MANAGER: {
    label: 'Manager',
    description: 'Branch management (legacy)',
    color: '#3b82f6',
  },
  RECEPTIONIST: {
    label: 'Receptionist',
    description: 'Front desk: check-in, payments, member lookup',
    color: '#10b981',
  },
  SALES_STAFF: {
    label: 'Sales Staff',
    description: 'Leads pipeline and membership conversions',
    color: '#f97316',
  },
  ACCOUNTANT: {
    label: 'Accountant',
    description: 'Financial reporting, invoices, and reconciliation',
    color: '#06b6d4',
  },
  TRAINER: {
    label: 'Trainer',
    description: 'Personal training sessions and client management',
    color: '#ec4899',
  },
  MEMBER: {
    label: 'Member',
    description: 'Self-service member portal',
    color: '#64748b',
  },
  OWNER: {
    label: 'Owner (Legacy)',
    description: 'Organization owner (legacy alias)',
    color: '#f59e0b',
  },
};
