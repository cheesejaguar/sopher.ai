CREATE TABLE "authoring_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "authoring_incidents_occurrence_count_check" CHECK ("authoring_incidents"."occurrence_count" >= 1),
	CONSTRAINT "authoring_incidents_severity_check" CHECK ("authoring_incidents"."severity" in ('warning', 'critical')),
	CONSTRAINT "authoring_incidents_category_check" CHECK ("authoring_incidents"."category" in (
        'dispatch', 'workflow_missing', 'stalled_heartbeat', 'invalid_pause',
        'completion_contradiction', 'cancellation_unconfirmed',
        'stale_reservation', 'event_persistence', 'operator_action'
      ))
);
--> statement-breakpoint
CREATE TABLE "authoring_run_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"pause_version" integer NOT NULL,
	"request_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"last_delivery_error" text,
	CONSTRAINT "authoring_run_inputs_pause_version_check" CHECK ("authoring_run_inputs"."pause_version" >= 1),
	CONSTRAINT "authoring_run_inputs_delivery_attempts_check" CHECK ("authoring_run_inputs"."delivery_attempts" >= 0),
	CONSTRAINT "authoring_run_inputs_status_check" CHECK ("authoring_run_inputs"."status" in ('accepted', 'delivered', 'consumed')),
	CONSTRAINT "authoring_run_inputs_kind_check" CHECK ("authoring_run_inputs"."kind" in ('outline_approval', 'credits_topup'))
);
--> statement-breakpoint
CREATE TABLE "authoring_stream_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"namespace" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authoring_stream_leases_namespace_check" CHECK ("authoring_stream_leases"."namespace" = 'progress' or "authoring_stream_leases"."namespace" ~ '^chapter:[1-9][0-9]{0,3}$'),
	CONSTRAINT "authoring_stream_leases_expiry_check" CHECK ("authoring_stream_leases"."expires_at" > "authoring_stream_leases"."created_at")
);
--> statement-breakpoint
ALTER TABLE "generation_events" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "current_stage" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "progress_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "stage_description" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "last_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "workflow_observed_status" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "workflow_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "workflow_missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "workflow_missing_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "pause_kind" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "pause_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "pause_key" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "pause_details" jsonb;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "pause_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "root_error_code" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "root_error_stage" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "next_event_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
WITH latest_stage AS (
	SELECT DISTINCT ON (event."run_id")
		event."run_id",
		event."payload"->>'stage' AS stage,
		CASE
			WHEN jsonb_typeof(event."payload"->'pct') = 'number'
				THEN greatest(0, least(100, (event."payload"->>'pct')::numeric::integer))
			ELSE 0
		END AS progress_pct,
		event."payload"->>'detail' AS detail,
		event."created_at"
	FROM "generation_events" event
	WHERE event."type" = 'stage'
		AND event."payload"->>'stage' IN (
			'queued', 'concept', 'outline', 'awaiting_approval', 'awaiting_credits',
			'bible', 'chapters', 'editing', 'continuity', 'revising',
			'finalizing', 'done', 'failed', 'cancelled'
		)
	ORDER BY event."run_id", event."seq" DESC
)
UPDATE "generation_runs" run
SET
	"current_stage" = CASE run."status"
		WHEN 'completed' THEN 'done'
		WHEN 'failed' THEN 'failed'
		WHEN 'cancelled' THEN 'cancelled'
		ELSE latest_stage.stage
	END,
	"progress_pct" = CASE
		WHEN run."status" = 'completed' THEN 100
		ELSE latest_stage.progress_pct
	END,
	"stage_description" = latest_stage.detail,
	"last_progress_at" = latest_stage."created_at",
	"heartbeat_at" = coalesce(
		run."heartbeat_at",
		latest_stage."created_at",
		run."started_at",
		run."created_at"
	)
FROM latest_stage
WHERE latest_stage."run_id" = run."id";--> statement-breakpoint
UPDATE "generation_runs"
SET
	"current_stage" = CASE "status"
		WHEN 'completed' THEN 'done'
		WHEN 'failed' THEN 'failed'
		WHEN 'cancelled' THEN 'cancelled'
		ELSE "current_stage"
	END,
	"progress_pct" = CASE WHEN "status" = 'completed' THEN 100 ELSE "progress_pct" END,
	"last_progress_at" = coalesce("last_progress_at", "completed_at", "started_at"),
	"heartbeat_at" = coalesce("heartbeat_at", "completed_at", "started_at", "created_at")
WHERE "status" IN ('completed', 'failed', 'cancelled');--> statement-breakpoint
UPDATE "generation_runs"
SET "heartbeat_at" = coalesce("heartbeat_at", "started_at", "created_at")
WHERE "status" IN ('queued', 'running', 'awaiting_input');--> statement-breakpoint
UPDATE "generation_runs"
SET "dispatch_attempts" = 1
WHERE (
		"workflow_run_id" IS NOT NULL
		OR "acceptance_uncertain_at" IS NOT NULL
		OR "acceptance_dispatch_claimed_at" IS NOT NULL
		OR "started_at" IS NOT NULL
		OR "status" <> 'queued'
	);--> statement-breakpoint
UPDATE "generation_runs" AS run
SET "next_event_seq" = coalesce((
	SELECT max(event."seq") + 1
	FROM "generation_events" AS event
	WHERE event."run_id" = run."id"
), 1);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "support_reference" uuid;--> statement-breakpoint
UPDATE "generation_runs"
SET "support_reference" = gen_random_uuid()
WHERE "support_reference" IS NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ALTER COLUMN "support_reference" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "generation_runs" ALTER COLUMN "support_reference" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "authoring_onboarding" jsonb DEFAULT '{"version":1,"seenCoachmarks":[]}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runs_id_project" ON "generation_runs" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runs_id_user" ON "generation_runs" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "authoring_incidents" ADD CONSTRAINT "authoring_incidents_run_project_generation_runs_fk" FOREIGN KEY ("run_id","project_id") REFERENCES "public"."generation_runs"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_run_inputs" ADD CONSTRAINT "authoring_run_inputs_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_stream_leases" ADD CONSTRAINT "authoring_stream_leases_run_user_generation_runs_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."generation_runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_incident_active" ON "authoring_incidents" USING btree ("run_id","dedupe_key") WHERE "authoring_incidents"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "idx_authoring_incidents_project" ON "authoring_incidents" USING btree ("project_id","resolved_at","severity");--> statement-breakpoint
CREATE INDEX "idx_authoring_incidents_active" ON "authoring_incidents" USING btree ("resolved_at","severity","last_observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_run_input_pause" ON "authoring_run_inputs" USING btree ("run_id","kind","pause_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_run_input_request" ON "authoring_run_inputs" USING btree ("run_id","request_key");--> statement-breakpoint
CREATE INDEX "idx_authoring_run_inputs_delivery" ON "authoring_run_inputs" USING btree ("status","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_authoring_stream_leases_active" ON "authoring_stream_leases" USING btree ("run_id","user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_authoring_stream_leases_user" ON "authoring_stream_leases" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_key" ON "generation_events" USING btree ("run_id","event_key") WHERE "generation_events"."event_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runs_support_reference" ON "generation_runs" USING btree ("support_reference");--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_seq_check" CHECK ("generation_events"."seq" >= 1);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_current_stage_check" CHECK ("generation_runs"."current_stage" in (
        'queued', 'concept', 'outline', 'awaiting_approval', 'awaiting_credits',
        'bible', 'chapters', 'editing', 'continuity', 'revising',
        'finalizing', 'done', 'failed', 'cancelled'
      ));--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_progress_pct_check" CHECK ("generation_runs"."progress_pct" between 0 and 100);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_workflow_observed_status_check" CHECK ("generation_runs"."workflow_observed_status" is null or "generation_runs"."workflow_observed_status" in (
        'pending', 'running', 'completed', 'failed', 'cancelled', 'missing', 'unavailable'
      ));--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_workflow_missing_count_check" CHECK ("generation_runs"."workflow_missing_count" >= 0);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_dispatch_attempts_check" CHECK ("generation_runs"."dispatch_attempts" between 0 and 3);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_pause_version_check" CHECK ("generation_runs"."pause_version" >= 0);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_next_event_seq_check" CHECK ("generation_runs"."next_event_seq" >= 1);
