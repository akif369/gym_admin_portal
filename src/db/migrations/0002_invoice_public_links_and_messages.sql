ALTER TABLE "invoices" ADD COLUMN "membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token" text;
--> statement-breakpoint
UPDATE "invoices"
SET "public_token" = md5(random()::text || clock_timestamp()::text || "id"::text)
WHERE "public_token" IS NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "public_token" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_membership_id_member_memberships_id_fk"
  FOREIGN KEY ("membership_id") REFERENCES "public"."member_memberships"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organization_invoice_number_unique" ON "invoices" USING btree ("organization_id", "invoice_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_membership_id_unique" ON "invoices" USING btree ("membership_id");
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "member_id" uuid,
  "invoice_id" uuid,
  "event_type" text NOT NULL,
  "recipient" text NOT NULL,
  "message" text NOT NULL,
  "provider" text DEFAULT 'EVOLUTION_GO' NOT NULL,
  "provider_message_id" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "error_message" text,
  "idempotency_key" text NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_deliveries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_member_id_members_id_fk"
  FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_invoice_id_invoices_id_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;
