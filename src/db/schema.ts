import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// Clerk user id is the primary key — no separate identity table.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  imageUrl: text("image_url"),
  ...timestamps,
});

export type ProjectSettings = {
  pov?: "first" | "third_limited" | "third_omniscient";
  tense?: "past" | "present";
  tone?: string;
  voiceProfile?: string;
  styleProfile?: string;
  heatLevel?: "none" | "mild" | "moderate" | "explicit";
  violenceLevel?: "none" | "mild" | "moderate" | "graphic";
  profanity?: "none" | "mild" | "moderate" | "strong";
  avoidTopics?: string[];
  qualityTier?: "draft" | "standard" | "premium";
  requireOutlineApproval?: boolean;
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    brief: text("brief"),
    genre: text("genre"),
    targetChapters: integer("target_chapters").default(10).notNull(),
    targetWordsPerChapter: integer("target_words_per_chapter").default(3000).notNull(),
    styleGuide: text("style_guide"),
    settings: jsonb("settings").$type<ProjectSettings>().default({}).notNull(),
    status: text("status", {
      enum: ["draft", "generating", "editing", "complete", "archived"],
    })
      .default("draft")
      .notNull(),
    ...timestamps,
  },
  (t) => [index("idx_projects_user").on(t.userId, t.updatedAt)],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    synopsis: text("synopsis"),
    concept: jsonb("concept").default({}).notNull(),
    frontMatter: jsonb("front_matter").default({}).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("uq_books_project").on(t.projectId)],
);

export const outlines = pgTable(
  "outlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    content: jsonb("content").notNull(),
    source: text("source", { enum: ["ai", "user"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_outline_version").on(t.bookId, t.version)],
);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number").notNull(),
    title: text("title"),
    summary: text("summary"),
    content: text("content").default("").notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    qualityScore: numeric("quality_score", { precision: 4, scale: 3 }),
    status: text("status", {
      enum: ["planned", "drafting", "drafted", "edited", "final"],
    })
      .default("planned")
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("uq_chapter_num").on(t.bookId, t.chapterNumber),
    index("idx_chapters_summary_fts").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.summary}, ''))`,
    ),
  ],
);

export const chapterRevisions = pgTable(
  "chapter_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source").notNull(),
    runId: uuid("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_revisions_chapter").on(t.chapterId, t.createdAt)],
);

/**
 * The story bible. Supersedes the character-only `character_bible`: characters
 * drift, but so do objects (a sword that grows a jewel) and places (a house
 * that grows a room), and `continuity_issues` already reasoned about setting
 * and plot categories this model could not represent.
 *
 * `attrs` is validated per kind by `src/ai/schemas/entities.ts`. Its `facts`
 * array is append-only, which is what lets a wave of concurrently drafting
 * chapters merge into one row without lost updates.
 */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["character", "location", "object", "organization", "event"],
    }).notNull(),
    name: text("name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    attrs: jsonb("attrs").$type<Record<string, unknown>>().default({}).notNull(),
    portraitAssetId: uuid("portrait_asset_id"),
    firstAppearanceChapter: integer("first_appearance_chapter"),
    lastUpdatedChapter: integer("last_updated_chapter"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("uq_entity_name").on(t.bookId, t.kind, t.name),
    index("idx_entities_book").on(t.bookId, t.kind),
  ],
);

/** The entity-relationship graph — siblings, owners, members, locations. */
export const entityRelationships = pgTable(
  "entity_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description"),
    establishedChapter: integer("established_chapter"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_entity_relationship").on(t.fromEntityId, t.toEntityId, t.type),
    index("idx_relationships_book").on(t.bookId),
  ],
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    workflowRunId: text("workflow_run_id"),
    kind: text("kind", {
      enum: ["full_book", "chapter", "edit_pass", "continuity", "export"],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "awaiting_input", "completed", "failed", "cancelled"],
    })
      .default("queued")
      .notNull(),
    config: jsonb("config").default({}).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_runs_project").on(t.projectId, t.createdAt),
    index("idx_runs_status").on(t.status),
    // Race-proof backstop for the "one active generation per project" rule.
    // Export runs are excluded so exports stay independent of generation.
    uniqueIndex("uq_runs_active_per_project")
      .on(t.projectId)
      .where(sql`status in ('queued','running','awaiting_input') and kind <> 'export'`),
  ],
);

export const generationEvents = pgTable(
  "generation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => generationRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_event_seq").on(t.runId, t.seq)],
);

// Ground truth for cost metering and margin analysis.
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => generationRuns.id, { onDelete: "set null" }),
    agentRole: text("agent_role").notNull(),
    operation: text("operation").notNull(),
    model: text("model").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).default(0).notNull(),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).default(0).notNull(),
    usd: numeric("usd", { precision: 12, scale: 6 }).default("0").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_llm_user_time").on(t.userId, t.createdAt),
    index("idx_llm_run").on(t.runId),
    index("idx_llm_project").on(t.projectId, t.createdAt),
  ],
);

/**
 * Prepaid credits, as an append-only ledger.
 *
 * Balance is the SUM of entries, never a stored mutable number. That is the
 * whole point: a webhook Stripe retries, a double-clicked checkout, or a
 * concurrent debit cannot silently inflate or corrupt a balance, and every
 * movement stays auditable against the `llm_calls` row that caused it.
 *
 * Amounts are in credits (1 credit = $1 retail), stored to 4 decimal places so
 * a single metered call can be debited exactly rather than rounded.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Positive for purchases and refunds, negative for usage. */
    amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
    kind: text("kind", {
      enum: ["purchase", "usage", "refund", "grant", "adjustment"],
    }).notNull(),
    /** Free text for the UI: "Author pack", "Chapter 7 draft". */
    description: text("description").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => generationRuns.id, { onDelete: "set null" }),
    /** Stripe checkout session or payment intent id — the idempotency anchor. */
    externalRef: text("external_ref"),
    /** Metered USD this debit corresponds to, for margin reconciliation. */
    meteredUsd: numeric("metered_usd", { precision: 12, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_ledger_user").on(t.userId, t.createdAt),
    // Idempotency: one credit entry per Stripe object, enforced by the database
    // rather than by application logic that a retry could race.
    uniqueIndex("uq_ledger_external_ref").on(t.externalRef),
  ],
);

export const budgets = pgTable("budgets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 2 })
    .default("20.00")
    .notNull(),
  hardLimit: boolean("hard_limit").default(true).notNull(),
  alertThresholdPct: integer("alert_threshold_pct").default(80).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SuggestionAnchor = {
  start: number;
  end: number;
  originalText: string;
  /** Ordinal among identical matches of originalText (0 = first). Absent on legacy/review rows. */
  occurrence?: number;
};

export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => generationRuns.id, { onDelete: "set null" }),
    chapterVersion: integer("chapter_version").notNull(),
    passType: text("pass_type", {
      enum: ["selection", "review", "proofread"],
    }).notNull(),
    suggestionType: text("suggestion_type").notNull(),
    severity: text("severity", { enum: ["info", "warning", "error"] })
      .default("info")
      .notNull(),
    anchor: jsonb("anchor").$type<SuggestionAnchor>().notNull(),
    suggestedText: text("suggested_text").notNull(),
    explanation: text("explanation").notNull(),
    status: text("status", { enum: ["pending", "applied", "rejected"] })
      .default("pending")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_suggestions_chapter").on(t.chapterId, t.status)],
);

export const continuityIssues = pgTable(
  "continuity_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => generationRuns.id, { onDelete: "set null" }),
    chapters: jsonb("chapters").$type<number[]>().default([]).notNull(),
    category: text("category", {
      enum: ["character", "timeline", "setting", "plot", "factual"],
    }).notNull(),
    severity: text("severity", { enum: ["critical", "major", "minor"] }).notNull(),
    description: text("description").notNull(),
    suggestedFix: text("suggested_fix"),
    status: text("status", { enum: ["open", "resolved", "dismissed"] })
      .default("open")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_continuity_book").on(t.bookId, t.status)],
);

export const contentToolRuns = pgTable(
  "content_tool_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
    toolId: text("tool_id").notNull(),
    input: jsonb("input").default({}).notNull(),
    output: jsonb("output").default({}).notNull(),
    usd: numeric("usd", { precision: 12, scale: 6 }).default("0").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_tool_runs_project").on(t.projectId, t.createdAt)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
    kind: text("kind", {
      enum: [
        "cover",
        "illustration",
        "diagram",
        "portrait",
        "export_epub",
        "export_pdf",
        "export_docx",
        "export_md",
      ],
    }).notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    meta: jsonb("meta").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_assets_project").on(t.projectId, t.kind)],
);
