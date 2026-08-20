CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" text DEFAULT 'PLATFORM_ADMIN' NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"description" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_logs" DROP CONSTRAINT "attendance_logs_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_payment_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "trainers" DROP CONSTRAINT "trainers_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "staff_audit_logs" DROP CONSTRAINT "staff_audit_logs_organization_id_organizations_id_fk";
--> statement-breakpoint
DROP INDEX "invoices_membership_id_unique";--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "weight_kg" SET DATA TYPE numeric(6, 2) USING "weight_kg"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "body_fat_percent" SET DATA TYPE numeric(5, 2) USING "body_fat_percent"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "chest_cm" SET DATA TYPE numeric(6, 2) USING "chest_cm"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "waist_cm" SET DATA TYPE numeric(6, 2) USING "waist_cm"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "hip_cm" SET DATA TYPE numeric(6, 2) USING "hip_cm"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "arm_cm" SET DATA TYPE numeric(6, 2) USING "arm_cm"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "thigh_cm" SET DATA TYPE numeric(6, 2) USING "thigh_cm"::numeric;--> statement-breakpoint
ALTER TABLE "member_measurements" ALTER COLUMN "bmi" SET DATA TYPE numeric(5, 2) USING "bmi"::numeric;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "last_login_ip" text;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_org_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_referred_by_members_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_organization_id_branches_id_organization_id_fk" FOREIGN KEY ("branch_id","organization_id") REFERENCES "public"."branches"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit_logs" ADD CONSTRAINT "staff_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settings_org_category_unique" ON "settings" USING btree ("organization_id","category") WHERE "settings"."branch_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "settings_org_branch_category_unique" ON "settings" USING btree ("organization_id","branch_id","category") WHERE "settings"."branch_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_key_unique" ON "roles" USING btree ("organization_id","key");--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_capacity_check" CHECK ("branches"."capacity" >= 0);--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "memberships_pt_total_check" CHECK ("member_memberships"."pt_sessions_total" >= 0);--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "memberships_pt_used_check" CHECK ("member_memberships"."pt_sessions_used" >= 0 AND "member_memberships"."pt_sessions_used" <= "member_memberships"."pt_sessions_total");--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "memberships_frozen_days_check" CHECK ("member_memberships"."frozen_days" >= 0);--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "plans_price_check" CHECK ("membership_plans"."price" >= 0);--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "plans_duration_check" CHECK ("membership_plans"."duration_days" > 0);--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "plans_gst_check" CHECK ("membership_plans"."gst_percent" >= 0 AND "membership_plans"."gst_percent" <= 100);--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "plans_joining_fee_check" CHECK ("membership_plans"."joining_fee" >= 0);--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "plans_pt_sessions_check" CHECK ("membership_plans"."pt_sessions_included" >= 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payments_amount_check" CHECK ("payment_transactions"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payments_gst_check" CHECK ("payment_transactions"."gst_amount" >= 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payments_total_check" CHECK ("payment_transactions"."total_amount" >= 0);