-- Corrects the completed_at backfill from 0008.
--
-- That one filtered on status = 'complete', which was self-defeating: the whole
-- reason this column exists is that a finished book is left in 'editing' (the
-- author edits next), so the filter matched zero rows. Verified against
-- production — every project was 'editing' or 'generating', and completed_at
-- came out null for all of them despite two genuinely finished books.
--
-- 0008 could not simply be edited: it had already run, and a migration file
-- that no longer matches what the database did is worse than a redundant one.
--
-- The generation runs are the real record of a book finishing.
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
UPDATE "projects" SET "completed_at" = "updated_at"
  WHERE "status" = 'complete' AND "completed_at" IS NULL;
