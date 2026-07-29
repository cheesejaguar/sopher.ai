ALTER TABLE "generation_runs" ADD COLUMN "approval_notes" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "subgenre" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "protagonist" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "setting" text;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "instruction" text;