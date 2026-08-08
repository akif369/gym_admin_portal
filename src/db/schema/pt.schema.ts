import { pgTable, uuid, text, timestamp, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { members } from './members.schema';
import { trainers } from './trainers.schema';
import { users } from './auth.schema';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const ptSessionStatusEnum = pgEnum('pt_session_status', [
  'UPCOMING',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
]);

// ── PT Packages ───────────────────────────────────────────────────────────────

export const ptPackages = pgTable('pt_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sessionsCount: integer('sessions_count').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  gstPercent: numeric('gst_percent', { precision: 5, scale: 2 }).notNull().default('18'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  description: text('description'),
  validityDays: integer('validity_days').default(90),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Member PT Package Purchases ───────────────────────────────────────────────

export const memberPtPackages = pgTable('member_pt_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  trainerId: uuid('trainer_id').references(() => trainers.id),
  packageId: uuid('package_id').references(() => ptPackages.id),
  packageName: text('package_name').notNull(),
  sessionsTotal: integer('sessions_total').notNull(),
  sessionsUsed: integer('sessions_used').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status', { enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'] }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── PT Sessions ───────────────────────────────────────────────────────────────

export const ptSessions = pgTable('pt_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  trainerId: uuid('trainer_id')
    .notNull()
    .references(() => trainers.id),
  memberPtPackageId: uuid('member_pt_package_id').references(() => memberPtPackages.id),
  memberName: text('member_name').notNull(), // denormalized
  trainerName: text('trainer_name').notNull(), // denormalized
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').default(60),
  status: ptSessionStatusEnum('status').notNull().default('UPCOMING'),
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type PtPackage = typeof ptPackages.$inferSelect;
export type NewPtPackage = typeof ptPackages.$inferInsert;
export type MemberPtPackage = typeof memberPtPackages.$inferSelect;
export type NewMemberPtPackage = typeof memberPtPackages.$inferInsert;
export type PtSession = typeof ptSessions.$inferSelect;
export type NewPtSession = typeof ptSessions.$inferInsert;
