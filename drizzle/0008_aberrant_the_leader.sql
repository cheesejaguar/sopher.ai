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
-- Backfill from the generation runs, which are the actual record of a book
-- finishing. Filtering on status = 'complete' would have been self-defeating:
-- the whole reason this column exists is that a finished book is left in
-- 'editing', so that filter matches almost nothing.
UPDATE "projects" p
SET "completed_at" = r.finished_at
FROM (
  SELECT "project_id", min("completed_at") AS finished_at
  FROM "generation_runs"
  WHERE "kind" = 'full_book' AND "status" = 'completed' AND "completed_at" IS NOT NULL
  GROUP BY "project_id"
) r
WHERE p."id" = r."project_id" AND p."completed_at" IS NULL;--> statement-breakpoint
-- Anything still unattributed but explicitly marked complete: updated_at is the
-- only estimate available. Approximate, but better than dropping the book out
-- of the completion funnel entirely.
UPDATE "projects" SET "completed_at" = "updated_at" WHERE "status" = 'complete' AND "completed_at" IS NULL;
