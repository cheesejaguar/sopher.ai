CREATE TABLE "authoring_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"stage" text NOT NULL,
	"prompt" text NOT NULL,
	"rationale" text,
	"options" jsonb NOT NULL,
	"recommended_option_id" text NOT NULL,
	"decision_digest" text NOT NULL,
	"pause_version" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_id" uuid,
	"decision" jsonb,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authoring_questions_options_count_check" CHECK (jsonb_array_length("authoring_questions"."options") = 3),
	CONSTRAINT "authoring_questions_pause_version_check" CHECK ("authoring_questions"."pause_version" is null or "authoring_questions"."pause_version" >= 1),
	CONSTRAINT "authoring_questions_status_check" CHECK ("authoring_questions"."status" in ('pending', 'answered')),
	CONSTRAINT "authoring_questions_stage_check" CHECK ("authoring_questions"."stage" = 'after_concept')
);
--> statement-breakpoint
ALTER TABLE "authoring_run_inputs" DROP CONSTRAINT "authoring_run_inputs_kind_check";--> statement-breakpoint
ALTER TABLE "generation_runs" DROP CONSTRAINT "generation_runs_current_stage_check";--> statement-breakpoint
ALTER TABLE "authoring_questions" ADD CONSTRAINT "authoring_questions_input_id_authoring_run_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."authoring_run_inputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_questions" ADD CONSTRAINT "authoring_questions_run_project_generation_runs_fk" FOREIGN KEY ("run_id","project_id") REFERENCES "public"."generation_runs"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_question_run_key" ON "authoring_questions" USING btree ("run_id","question_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_question_pause" ON "authoring_questions" USING btree ("run_id","pause_version") WHERE "authoring_questions"."pause_version" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authoring_question_input" ON "authoring_questions" USING btree ("input_id") WHERE "authoring_questions"."input_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_authoring_questions_pending" ON "authoring_questions" USING btree ("run_id","status");--> statement-breakpoint
ALTER TABLE "authoring_run_inputs" ADD CONSTRAINT "authoring_run_inputs_kind_check" CHECK ("authoring_run_inputs"."kind" in ('outline_approval', 'credits_topup', 'creative_decision'));--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_current_stage_check" CHECK ("generation_runs"."current_stage" in (
        'queued', 'concept', 'awaiting_guidance', 'outline', 'awaiting_approval', 'awaiting_credits',
        'bible', 'chapters', 'editing', 'continuity', 'revising',
        'finalizing', 'done', 'failed', 'cancelled'
      ));