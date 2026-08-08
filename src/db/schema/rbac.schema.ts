import { pgTable, uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { users } from './auth.schema';

// ── Roles ─────────────────────────────────────────────────────────────────────

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  key: text('key').notNull(), // 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'TRAINER'
  name: text('name').notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default('[]'), // string[]
  isSystem: boolean('is_system').notNull().default(false), // system roles can't be deleted
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── User Permission Overrides ─────────────────────────────────────────────────
// Per-user permission overrides on top of role defaults

export const userPermissions = pgTable('user_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permissions: jsonb('permissions').notNull().default('[]'), // string[] — full override
  grantedBy: uuid('granted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;

// ── System Permission Registry ────────────────────────────────────────────────

export const SYSTEM_PERMISSIONS = [
  'member.view',
  'member.create',
  'member.update',
  'member.delete',
  'attendance.view',
  'attendance.create',
  'attendance.correct',
  'payment.view',
  'payment.create',
  'payment.refund',
  'revenue.view',
  'trainer.view',
  'trainer.manage',
  'pt.view',
  'pt.manage',
  'lead.view',
  'lead.manage',
  'lead.convert',
  'workout.view',
  'workout.manage',
  'report.view',
  'report.export',
  'staff.view',
  'staff.manage',
  'settings.view',
  'settings.manage',
  'org.manage',
] as const;

export type Permission = (typeof SYSTEM_PERMISSIONS)[number];

// ── Default Role Permissions ──────────────────────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: SYSTEM_PERMISSIONS as unknown as string[],
  MANAGER: [
    'member.view', 'member.create', 'member.update',
    'attendance.view', 'attendance.create', 'attendance.correct',
    'payment.view', 'payment.create', 'payment.refund', 'revenue.view',
    'trainer.view', 'trainer.manage',
    'pt.view', 'pt.manage',
    'lead.view', 'lead.manage', 'lead.convert',
    'workout.view', 'workout.manage',
    'report.view', 'report.export',
    'staff.view',
    'settings.view',
  ],
  RECEPTIONIST: [
    'member.view', 'member.create',
    'attendance.view', 'attendance.create',
    'payment.view', 'payment.create',
    'pt.view',
    'lead.view', 'lead.manage',
  ],
  TRAINER: [
    'member.view',
    'attendance.view',
    'pt.view', 'pt.manage',
    'workout.view', 'workout.manage',
  ],
};
