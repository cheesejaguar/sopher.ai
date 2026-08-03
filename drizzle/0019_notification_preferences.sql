ALTER TABLE "users" ADD COLUMN "email_authoring_action_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_authoring_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_authoring_completed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"event_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "notification_deliveries_category_check" CHECK ("notification_deliveries"."category" in ('authoringActionRequired', 'authoringReminders', 'authoringCompleted')),
	CONSTRAINT "notification_deliveries_status_check" CHECK ("notification_deliveries"."status" in ('pending', 'sent', 'suppressed', 'failed')),
	CONSTRAINT "notification_deliveries_claim_check" CHECK ((
		("notification_deliveries"."status" = 'pending' and "notification_deliveries"."claim_token" is not null and "notification_deliveries"."lease_expires_at" is not null)
		or
		("notification_deliveries"."status" <> 'pending' and "notification_deliveries"."claim_token" is null and "notification_deliveries"."lease_expires_at" is null)
	))
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_deliveries_event_key" ON "notification_deliveries" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_user" ON "notification_deliveries" USING btree ("user_id", "created_at");
