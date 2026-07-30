ALTER TABLE "generation_runs" ADD COLUMN "request_key" uuid;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "acceptance_uncertain_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "acceptance_dispatch_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
UPDATE "generation_runs"
SET "acceptance_uncertain_at" = "created_at"
WHERE "status" = 'queued'
  AND "workflow_run_id" IS NULL
  AND "acceptance_uncertain_at" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "experience" text DEFAULT 'full_book' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "creation_key" uuid;--> statement-breakpoint
CREATE INDEX "idx_runs_health_check" ON "generation_runs" USING btree ("status","health_checked_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runs_project_request_key" ON "generation_runs" USING btree ("project_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projects_user_creation_key" ON "projects" USING btree ("user_id","creation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projects_one_trial_per_user" ON "projects" USING btree ("user_id") WHERE "projects"."experience" = 'trial_short_story';
