ALTER TABLE "llm_calls" ADD COLUMN "cache_write_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ledger_run" ON "credit_ledger" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_user_external_ref" ON "credit_ledger" USING btree ("user_id","external_ref" text_pattern_ops);
