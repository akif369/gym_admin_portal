import { pgTable, uuid, text, timestamp, boolean, pgEnum, date } from 'drizzle-orm/pg-core';
import { organizations } from './org.schema';
import { branches } from './org.schema';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const memberStatusEnum = pgEnum('member_status', [
  'ACTIVE',
  'FROZEN',
  'EXPIRED',
  'ARCHIVED',
]);

export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);

export const experienceLevelEnum = pgEnum('experience_level', [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
]);

// ── Members ───────────────────────────────────────────────────────────────────

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id),
  memberNumber: text('member_number').notNull(), // e.g. GYM001 — unique per org
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone').notNull(),
  gender: genderEnum('gender'),
  dob: date('dob'),
  photoUrl: text('photo_url'),
  address: text('address'),
  goal: text('goal'), // free-text fitness goal
  experienceLevel: experienceLevelEnum('experience_level'),
  status: memberStatusEnum('status').notNull().default('ACTIVE'),
  joinDate: date('join_date').notNull(),
  notes: text('notes'),
  referredBy: uuid('referred_by'), // member_id of referrer

  // Soft delete
  deletedAt: timestamp('deleted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Member Emergency Contacts ─────────────────────────────────────────────────

export const memberEmergencyContacts = pgTable('member_emergency_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  relation: text('relation').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Member Health Profiles ────────────────────────────────────────────────────

export const memberHealthProfiles = pgTable('member_health_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: 'cascade' }),
  medicalConditions: text('medical_conditions'),
  allergies: text('allergies'),
  injuries: text('injuries'),
  bloodGroup: text('blood_group'),
  medications: text('medications'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Member Measurements ───────────────────────────────────────────────────────

export const memberMeasurements = pgTable('member_measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  weightKg: text('weight_kg'), // stored as text to preserve precision
  bodyFatPercent: text('body_fat_percent'),
  chestCm: text('chest_cm'),
  waistCm: text('waist_cm'),
  hipCm: text('hip_cm'),
  armCm: text('arm_cm'),
  thighCm: text('thigh_cm'),
  bmi: text('bmi'),
  notes: text('notes'),
  recordedBy: uuid('recorded_by'), // staff user_id
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type MemberEmergencyContact = typeof memberEmergencyContacts.$inferSelect;
export type NewMemberEmergencyContact = typeof memberEmergencyContacts.$inferInsert;
export type MemberHealthProfile = typeof memberHealthProfiles.$inferSelect;
export type NewMemberHealthProfile = typeof memberHealthProfiles.$inferInsert;
export type MemberMeasurement = typeof memberMeasurements.$inferSelect;
export type NewMemberMeasurement = typeof memberMeasurements.$inferInsert;
