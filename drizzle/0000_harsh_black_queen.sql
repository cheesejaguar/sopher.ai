CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"kind" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"synopsis" text,
	"concept" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"front_matter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"monthly_limit_usd" numeric(10, 2) DEFAULT '20.00' NOT NULL,
	"hard_limit" boolean DEFAULT true NOT NULL,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter_number" integer NOT NULL,
	"title" text,
	"summary" text,
	"content" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"quality_score" numeric(4, 3),
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_bible" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"name" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_chapter" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"tool_id" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"run_id" uuid,
	"chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"suggested_fix" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"workflow_run_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid,
	"run_id" uuid,
	"agent_role" text NOT NULL,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"brief" text,
	"genre" text,
	"target_chapters" integer DEFAULT 10 NOT NULL,
	"target_words_per_chapter" integer DEFAULT 3000 NOT NULL,
	"style_guide" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"run_id" uuid,
	"chapter_version" integer NOT NULL,
	"pass_type" text NOT NULL,
	"suggestion_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"anchor" jsonb NOT NULL,
	"suggested_text" text NOT NULL,
	"explanation" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_bible" ADD CONSTRAINT "character_bible_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tool_runs" ADD CONSTRAINT "content_tool_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tool_runs" ADD CONSTRAINT "content_tool_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tool_runs" ADD CONSTRAINT "content_tool_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_issues" ADD CONSTRAINT "continuity_issues_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_issues" ADD CONSTRAINT "continuity_issues_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlines" ADD CONSTRAINT "outlines_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_project" ON "assets" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_books_project" ON "books" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_revisions_chapter" ON "chapter_revisions" USING btree ("chapter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chapter_num" ON "chapters" USING btree ("book_id","chapter_number");--> statement-breakpoint
CREATE INDEX "idx_chapters_summary_fts" ON "chapters" USING gin (to_tsvector('english', coalesce("summary", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_character_name" ON "character_bible" USING btree ("book_id","name");--> statement-breakpoint
CREATE INDEX "idx_tool_runs_project" ON "content_tool_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_continuity_book" ON "continuity_issues" USING btree ("book_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_seq" ON "generation_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "idx_runs_project" ON "generation_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_runs_status" ON "generation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_llm_user_time" ON "llm_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_run" ON "llm_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_llm_project" ON "llm_calls" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_outline_version" ON "outlines" USING btree ("book_id","version");--> statement-breakpoint
CREATE INDEX "idx_projects_user" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_suggestions_chapter" ON "suggestions" USING btree ("chapter_id","status");