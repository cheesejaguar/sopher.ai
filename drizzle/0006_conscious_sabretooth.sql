ALTER TABLE "content_tool_runs" DROP CONSTRAINT "content_tool_runs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "generation_runs" DROP CONSTRAINT "generation_runs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "content_tool_runs" ADD CONSTRAINT "content_tool_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;