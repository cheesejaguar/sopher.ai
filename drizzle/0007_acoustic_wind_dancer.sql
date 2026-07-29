CREATE TABLE "moderation_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_number" integer,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'review' NOT NULL,
	"excerpt" text,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_flags_status" ON "moderation_flags" USING btree ("status","created_at");--> statement-breakpoint
-- Bootstrap admin access: the founder account, plus the dev fallback identity
-- so local development and DB-gated e2e can exercise the admin surface.
UPDATE "users" SET "role" = 'admin' WHERE "email" = 'cheesejaguar@gmail.com' OR "id" = 'dev-user';
