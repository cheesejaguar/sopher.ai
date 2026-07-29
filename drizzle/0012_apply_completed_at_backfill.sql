-- Applies the completed_at backfill that 0010 was supposed to perform.
--
-- 0010 will never run. drizzle-kit applies only migrations whose journal `when`
-- exceeds the newest created_at in __drizzle_migrations. Renaming the
-- already-applied 0010_green_bloodaxe to 0011_author_inputs left its SQL — and
-- therefore its hash — unchanged, so drizzle treated it as applied and its
-- later `when` became the watermark. 0010_backfill_completed_at was authored
-- with an earlier `when`, so it sits permanently below that line: skipped, not
-- pending. Verified in production, where 11 of 12 journal entries were applied
-- and every projects.completed_at was still null despite two finished books.
--
-- The lesson, recorded here because the failure is silent: never rename a
-- migration that has already run. Add a new one.
--
-- Idempotent, so re-running costs nothing.
UPDATE "projects" p
SET "completed_at" = r.finished_at
FROM (
  SELECT "project_id", min("completed_at") AS finished_at
  FROM "generation_runs"
  WHERE "kind" = 'full_book' AND "status" = 'completed' AND "completed_at" IS NOT NULL
  GROUP BY "project_id"
) r
WHERE p."id" = r."project_id" AND p."completed_at" IS NULL;--> statement-breakpoint
UPDATE "projects" SET "completed_at" = "updated_at"
  WHERE "status" = 'complete' AND "completed_at" IS NULL;
