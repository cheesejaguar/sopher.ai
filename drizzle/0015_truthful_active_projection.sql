-- Migration 0014 may already be applied on a preview before this repair ships.
-- Keep it immutable and repair active legacy rows through this forward-only step.
--
-- Legacy Workflows can persist running/awaiting_input before their first stage
-- event. Status proves they advanced beyond the queue, while kind supplies only
-- a safe stage lower bound. One percent is the earliest production preflight
-- marker; deliberately leave pause fields unset because the input type is unknown.
WITH active_without_recognized_stage AS (
	SELECT run."id"
	FROM "generation_runs" run
	WHERE run."status" IN ('running', 'awaiting_input')
		AND NOT EXISTS (
			SELECT 1
			FROM "generation_events" event
			WHERE event."run_id" = run."id"
				AND event."type" = 'stage'
				AND event."payload"->>'stage' IN (
					'queued', 'concept', 'outline', 'awaiting_approval', 'awaiting_credits',
					'bible', 'chapters', 'editing', 'continuity', 'revising',
					'finalizing', 'done', 'failed', 'cancelled'
				)
		)
)
UPDATE "generation_runs" run
SET
	"current_stage" = CASE run."kind"
		WHEN 'chapter' THEN 'chapters'
		WHEN 'edit_pass' THEN 'editing'
		WHEN 'continuity' THEN 'continuity'
		WHEN 'export' THEN 'finalizing'
		ELSE 'concept'
	END,
	"progress_pct" = greatest(run."progress_pct", 1),
	"stage_description" = coalesce(
		run."stage_description",
		CASE run."status"
			WHEN 'awaiting_input' THEN 'Production is waiting for author input; the exact request was not recorded before durable tracking was enabled.'
			ELSE 'Production was already in progress when durable tracking was enabled.'
		END
	),
	"last_progress_at" = coalesce(run."last_progress_at", run."started_at", run."created_at"),
	"heartbeat_at" = coalesce(run."heartbeat_at", run."started_at", run."created_at")
FROM active_without_recognized_stage active
WHERE active."id" = run."id"
	AND run."current_stage" = 'queued'
	AND run."progress_pct" = 0;
