ALTER TABLE "books" ADD CONSTRAINT "uq_books_id_project" UNIQUE("id","project_id");
--> statement-breakpoint
CREATE TABLE "publication_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source_digest" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"incomplete" boolean DEFAULT false NOT NULL,
	"chapter_count" integer NOT NULL,
	"total_words" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_publication_edition_id_project_user" UNIQUE("id","project_id","user_id"),
	CONSTRAINT "publication_editions_digest_check" CHECK (length("publication_editions"."source_digest") = 64),
	CONSTRAINT "publication_editions_chapter_count_check" CHECK ("publication_editions"."chapter_count" > 0),
	CONSTRAINT "publication_editions_total_words_check" CHECK ("publication_editions"."total_words" > 0)
);
--> statement-breakpoint
CREATE TABLE "reader_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reader_shares_token_hash_check" CHECK (length("reader_shares"."token_hash") = 64),
	CONSTRAINT "reader_shares_status_check" CHECK (("reader_shares"."status" = 'active' and "reader_shares"."revoked_at" is null)
        or ("reader_shares"."status" = 'revoked' and "reader_shares"."revoked_at" is not null)),
	CONSTRAINT "reader_shares_expiry_check" CHECK ("reader_shares"."expires_at" is null or "reader_shares"."expires_at" > "reader_shares"."created_at")
);
--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_book_project_fk" FOREIGN KEY ("book_id","project_id") REFERENCES "public"."books"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_shares" ADD CONSTRAINT "reader_shares_edition_project_user_fk" FOREIGN KEY ("edition_id","project_id","user_id") REFERENCES "public"."publication_editions"("id","project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_publication_edition_source" ON "publication_editions" USING btree ("project_id","source_digest");--> statement-breakpoint
CREATE INDEX "idx_publication_editions_owner" ON "publication_editions" USING btree ("user_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reader_shares_token_hash" ON "reader_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_reader_shares_owner" ON "reader_shares" USING btree ("user_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_reader_shares_active" ON "reader_shares" USING btree ("status","expires_at");
