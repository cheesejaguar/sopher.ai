CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"anon_id" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition" jsonb;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_name_created" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "idx_events_anon" ON "analytics_events" USING btree ("anon_id","created_at");--> statement-breakpoint
-- Backfill: for books already marked complete, updated_at is the best estimate
-- we have of when they finished. It is an approximation (an author who edited
-- afterwards moved it), but leaving these null would drop every existing book
-- out of the completion funnel entirely, which is a worse answer than a
-- slightly late one. New rows get a real timestamp.
UPDATE "projects" SET "completed_at" = "updated_at" WHERE "status" = 'complete' AND "completed_at" IS NULL;
