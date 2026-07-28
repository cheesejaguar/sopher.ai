CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portrait_asset_id" uuid,
	"first_appearance_chapter" integer,
	"last_updated_chapter" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"established_chapter" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_name" ON "entities" USING btree ("book_id","kind","name");--> statement-breakpoint
CREATE INDEX "idx_entities_book" ON "entities" USING btree ("book_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_relationship" ON "entity_relationships" USING btree ("from_entity_id","to_entity_id","type");--> statement-breakpoint
CREATE INDEX "idx_relationships_book" ON "entity_relationships" USING btree ("book_id");--> statement-breakpoint
-- Backfill: every character_bible row becomes a kind='character' entity.
-- The old `facts` jsonb held {role, appearance, personality, relationships,
-- facts[], firstAppearance}; role and facts[] map directly, the rest is
-- preserved under the same keys since the character attrs schema is a superset.
INSERT INTO "entities" ("book_id", "kind", "name", "aliases", "attrs", "first_appearance_chapter", "last_updated_chapter", "created_at", "updated_at")
SELECT
  cb."book_id",
  'character',
  cb."name",
  '[]'::jsonb,
  jsonb_strip_nulls(
    jsonb_build_object(
      'role', cb."facts"->>'role',
      'appearance', CASE
        WHEN jsonb_typeof(cb."facts"->'appearance') = 'object'
          THEN (SELECT string_agg(value, ', ') FROM jsonb_each_text(cb."facts"->'appearance'))
        ELSE cb."facts"->>'appearance'
      END,
      'personality', CASE WHEN jsonb_typeof(cb."facts"->'personality') = 'array' THEN cb."facts"->'personality' ELSE '[]'::jsonb END,
      'facts', CASE WHEN jsonb_typeof(cb."facts"->'facts') = 'array' THEN cb."facts"->'facts' ELSE '[]'::jsonb END
    )
  ),
  NULLIF(cb."facts"->>'firstAppearance', '')::integer,
  cb."updated_by_chapter",
  cb."created_at",
  cb."updated_at"
FROM "character_bible" cb
ON CONFLICT ("book_id", "kind", "name") DO NOTHING;
