import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum, foreignKey } from 'drizzle-orm/pg-core';
import { branches, organizations } from './org.schema';

// ── Enums ─────────────────────────────────────────────────────────────────────

/**
 * User role enum.
 *
 * Hierarchy (highest → lowest privilege within the gym-side app):
 *   ORGANIZATION_OWNER > BRANCH_OWNER > BRANCH_MANAGER > MANAGER
 *   > SALES_STAFF > ACCOUNTANT > RECEPTIONIST > TRAINER > MEMBER
 *
 * Legacy aliases kept for backward compatibility during migration:
 *   OWNER   → maps to ORGANIZATION_OWNER behaviour
 *   MANAGER → maps to BRANCH_MANAGER behaviour
 */
export const userRoleEnum = pgEnum('user_role', [
  // ── Gym-chain level ────────────────────────────────────────────────────────
  'ORGANIZATION_OWNER',   // Owns the entire gym chain; sees all branches, full financials
  'BRANCH_OWNER',         // Owns/franchises a single branch; full branch P&L access

  // ── Branch operational level ───────────────────────────────────────────────
  'BRANCH_MANAGER',       // Day-to-day management of a branch (no P&L, no salary data)
  'MANAGER',              // Legacy alias — same permissions as BRANCH_MANAGER

  // ── Branch staff level ─────────────────────────────────────────────────────
  'RECEPTIONIST',         // Front desk: check-in/out, walk-in payments, member lookup
  'SALES_STAFF',          // Leads pipeline, conversions, trial follow-ups
  'ACCOUNTANT',           // Read-only financial view: revenue, invoices, reconciliation

  // ── Fitness staff ──────────────────────────────────────────────────────────
  'TRAINER',              // PT sessions, assigned clients, workout templates

  // ── End customers ─────────────────────────────────────────────────────────
  'MEMBER',               // Member self-service portal

  // ── Legacy (deprecated — kept so existing rows don't break) ───────────────
  'OWNER',                // @deprecated — use ORGANIZATION_OWNER
]);

// ── Users (Staff + Member portal accounts) ────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id'), // references branches.id — set separately to avoid circular dep
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('RECEPTIONIST'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  photoUrl: text('photo_url'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'INVITED'] }).notNull().default('ACTIVE'),

  /**
   * Links this user account to a gym member profile.
   * Only populated for MEMBER-role accounts (member self-service portal).
   * Staff roles will always have this as NULL.
   */
  memberId: uuid('member_id'), // references members.id — set separately to avoid circular dep

  /** Whether this account was created via an invite flow and hasn't logged in yet */
  isInvitePending: boolean('is_invite_pending').notNull().default(false),

  // Brute-force protection
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp: text('last_login_ip'),

  // Soft delete
  deletedAt: timestamp('deleted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.branchId, table.organizationId],
    foreignColumns: [branches.id, branches.organizationId],
  }),
]);

// ── Staff Invite Tokens ───────────────────────────────────────────────────────

/**
 * Used for the invite flow: staff creates a new user, a token is emailed,
 * the recipient clicks the link and sets their password.
 */
export const staffInviteTokens = pgTable('staff_invite_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── User Sessions (Refresh Tokens) ────────────────────────────────────────────

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  deviceInfo: text('device_info'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Password Reset Tokens ─────────────────────────────────────────────────────

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type StaffInviteToken = typeof staffInviteTokens.$inferSelect;
export type NewStaffInviteToken = typeof staffInviteTokens.$inferInsert;

// ── Role Constants (typed) ────────────────────────────────────────────────────

export const UserRole = {
  ORGANIZATION_OWNER: 'ORGANIZATION_OWNER',
  BRANCH_OWNER: 'BRANCH_OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  SALES_STAFF: 'SALES_STAFF',
  ACCOUNTANT: 'ACCOUNTANT',
  TRAINER: 'TRAINER',
  MEMBER: 'MEMBER',
  OWNER: 'OWNER', // @deprecated
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

/** Roles that have access to the branch admin dashboard */
export const BRANCH_ADMIN_ROLES: UserRoleType[] = [
  'ORGANIZATION_OWNER', 'BRANCH_OWNER', 'BRANCH_MANAGER', 'MANAGER',
  'RECEPTIONIST', 'SALES_STAFF', 'ACCOUNTANT', 'OWNER',
];

/** Roles that can see org-wide data (multi-branch) */
export const ORG_LEVEL_ROLES: UserRoleType[] = [
  'ORGANIZATION_OWNER', 'OWNER',
];

/** Roles scoped to a single branch */
export const BRANCH_LEVEL_ROLES: UserRoleType[] = [
  'BRANCH_OWNER', 'BRANCH_MANAGER', 'MANAGER',
  'RECEPTIONIST', 'SALES_STAFF', 'ACCOUNTANT',
];

/**
 * Returns the portal type for a given role.
 * Used by the frontend middleware to route users to the correct dashboard.
 */
export function getPortalType(role: UserRoleType): 'org-owner' | 'branch' | 'trainer' | 'member' {
  if (ORG_LEVEL_ROLES.includes(role)) return 'org-owner';
  if (role === 'TRAINER') return 'trainer';
  if (role === 'MEMBER') return 'member';
  return 'branch';
}

// ── Platform Admins ────────────────────────────────────────────────────────────

export const platformAdminRoleEnum = pgEnum('platform_admin_role', [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
]);

export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(), // We'll store lowercase email here
  passwordHash: text('password_hash').notNull(),
  role: platformAdminRoleEnum('role').notNull().default('ADMIN'),
  status: text('status', { enum: ['ACTIVE', 'SUSPENDED'] }).notNull().default('ACTIVE'),

  // Login security fields
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  
  // Auditing
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp: text('last_login_ip'),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
