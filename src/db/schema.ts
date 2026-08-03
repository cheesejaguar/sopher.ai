import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
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
  role: text("role", { enum: ["user", "admin"] })
    .default("user")
    .notNull(),
  /** Suspension blocks spend paths only; reading and exporting always work. */
  suspended: boolean("suspended").default(false).notNull(),
  /**
   * First-touch acquisition, captured once and never overwritten. This is what
   * makes "which channel produced paying customers" a join against
   * credit_ledger rather than a guess — GA can attribute a session, but it
   * cannot tell you a specific user's lifetime revenue.
   */
  acquisition: jsonb("acquisition").$type<Acquisition | null>(),
  /**
   * Small, cross-device authoring guidance state. Journey completion is
   * derived from durable project artifacts; this stores only presentation
   * preferences so it can never become another lifecycle source of truth.
   */
  authoringOnboarding: jsonb("authoring_onboarding")
    .$type<AuthoringOnboarding>()
    .default({ version: 1, seenCoachmarks: [] })
    .notNull(),
  /** Optional authoring notices. Billing and account-security mail bypasses these controls. */
  emailAuthoringActionRequired: boolean("email_authoring_action_required").default(true).notNull(),
  emailAuthoringReminders: boolean("email_authoring_reminders").default(true).notNull(),
  emailAuthoringCompleted: boolean("email_authoring_completed").default(true).notNull(),
  ...timestamps,
});

/**
 * Content-free delivery ledger. Stable event keys make Workflow replays safe,
 * and a durable suppressed decision cannot become a stale email after opt-in.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["authoringActionRequired", "authoringReminders", "authoringCompleted"],
    }).notNull(),
    eventKey: text("event_key").notNull(),
    status: text("status", {
      enum: ["pending", "sent", "suppressed", "failed"],
    })
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    claimToken: uuid("claim_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("uq_notification_deliveries_event_key").on(t.eventKey),
    index("idx_notification_deliveries_user").on(t.userId, t.createdAt),
    check(
      "notification_deliveries_category_check",
      sql`${t.category} in ('authoringActionRequired', 'authoringReminders', 'authoringCompleted')`,
    ),
    check(
      "notification_deliveries_status_check",
      sql`${t.status} in ('pending', 'sent', 'suppressed', 'failed')`,
    ),
    check(
      "notification_deliveries_claim_check",
      sql`(
        (${t.status} = 'pending' and ${t.claimToken} is not null and ${t.leaseExpiresAt} is not null)
        or
        (${t.status} <> 'pending' and ${t.claimToken} is null and ${t.leaseExpiresAt} is null)
      )`,
    ),
  ],
);

export type Acquisition = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  /** Referring host only — never the full URL, which can carry PII in a query. */
  referrerHost?: string;
  /** First page of the first visit. */
  landingPath?: string;
  capturedAt: string;
};

export type AuthoringOnboarding = {
  version: number;
  dismissedAt?: string;
  seenCoachmarks?: string[];
};

export type ProjectSettings = {
  /** Whether production pauses for the versioned post-concept creative decision. */
  authoringMode?: "guided" | "autopilot";
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

export type AuthoringQuestionOption = {
  id: string;
  label: string;
  description: string;
};

export type AuthoringQuestionDecision = {
  questionId: string;
  questionKey: "after_concept";
  mode: "option" | "custom" | "sopher";
  selectedOptionId: string | null;
  answer: string;
};

export type ProjectExperience = "trial_short_story" | "full_book";

export type PublicationEditionSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  incomplete: boolean;
  title: string;
  author: string;
  synopsis: string | null;
  genre: string | null;
  editionNote: string;
  matter: Record<string, unknown>;
  coverUrl: string | null;
  assetUrls: string[];
  chapters: Array<{
    number: number;
    title: string;
    markdown: string;
    wordCount: number;
  }>;
  figures: Record<
    string,
    {
      svgUrl: string | null;
      pngUrl: string | null;
      alt: string;
      width?: number;
      height?: number;
    }
  >;
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
    /**
     * The wizard collects these as separate fields and then glues them onto the
     * end of the brief as English (composeBrief). Persisting them structured
     * too means answering "which subgenres do people pick" is a GROUP BY rather
     * than a regex over prose. The brief text is unchanged, so generation
     * output is identical.
     */
    subgenre: text("subgenre"),
    protagonist: text("protagonist"),
    setting: text("setting"),
    /**
     * Frozen product entitlement for this manuscript. Existing projects are
     * full books; the included-story path opts into its smaller server-owned
     * production shape explicitly.
     */
    experience: text("experience", {
      enum: ["trial_short_story", "full_book"],
    })
      .default("full_book")
      .notNull(),
    /**
     * Browser-generated idempotency key for the wizard submit. It is scoped to
     * the owner so replaying an uncertain response returns the same project.
     */
    creationKey: uuid("creation_key"),
    targetChapters: integer("target_chapters").default(10).notNull(),
    targetWordsPerChapter: integer("target_words_per_chapter").default(3000).notNull(),
    styleGuide: text("style_guide"),
    settings: jsonb("settings").$type<ProjectSettings>().default({}).notNull(),
    status: text("status", {
      enum: ["draft", "generating", "editing", "complete", "archived"],
    })
      .default("draft")
      .notNull(),
    /**
     * When the book first reached "complete". Distinct from updatedAt, which
     * the admin overview was using as a proxy — that is wrong the moment the
     * author edits a finished book, which is exactly what they do next.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("idx_projects_user").on(t.userId, t.updatedAt),
    uniqueIndex("uq_projects_user_creation_key").on(t.userId, t.creationKey),
    uniqueIndex("uq_projects_one_trial_per_user")
      .on(t.userId)
      .where(sql`${t.experience} = 'trial_short_story'`),
  ],
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
  (t) => [
    uniqueIndex("uq_books_project").on(t.projectId),
    unique("uq_books_id_project").on(t.id, t.projectId),
  ],
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
      .references(() => users.id, { onDelete: "cascade" }),
    /** Idempotency key for one deliberate authoring-run request. */
    requestKey: uuid("request_key"),
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
    /** Canonical progress is persisted with each durable event before streaming. */
    currentStage: text("current_stage", {
      enum: [
        "queued",
        "concept",
        "awaiting_guidance",
        "outline",
        "awaiting_approval",
        "awaiting_credits",
        "bible",
        "chapters",
        "editing",
        "continuity",
        "revising",
        "finalizing",
        "done",
        "failed",
        "cancelled",
      ],
    })
      .default("queued")
      .notNull(),
    progressPct: integer("progress_pct").default(0).notNull(),
    stageDescription: text("stage_description"),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /**
     * Last authoritative Workflow observation. Missing and unavailable are
     * observations, never terminal database states.
     */
    workflowObservedStatus: text("workflow_observed_status", {
      enum: ["pending", "running", "completed", "failed", "cancelled", "missing", "unavailable"],
    }),
    workflowObservedAt: timestamp("workflow_observed_at", { withTimezone: true }),
    workflowMissingSince: timestamp("workflow_missing_since", { withTimezone: true }),
    workflowMissingCount: integer("workflow_missing_count").default(0).notNull(),
    /** Initial dispatch plus at most two same-run recovery dispatches. */
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    /**
     * Cancellation is requested first. Terminal cancellation is recorded only
     * after Workflow confirms it or no remote work could have started.
     */
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    pauseKind: text("pause_kind", {
      enum: ["outline_approval", "credits_topup", "creative_decision"],
    }),
    pauseVersion: integer("pause_version").default(0).notNull(),
    /** Stable Workflow step id that makes pause allocation replay-safe. */
    pauseKey: text("pause_key"),
    pauseDetails: jsonb("pause_details").$type<AuthoringPauseDetails | null>(),
    pauseRegisteredAt: timestamp("pause_registered_at", { withTimezone: true }),
    rootErrorCode: text("root_error_code"),
    rootErrorStage: text("root_error_stage"),
    /** Allocated under the run row lock; legacy events remain valid. */
    nextEventSeq: integer("next_event_seq").default(1).notNull(),
    /** Opaque, copyable support handle that carries no manuscript content. */
    supportReference: uuid("support_reference").defaultRandom().notNull(),
    /**
     * What the author wrote when sending the outline back for revision. Lived
     * only inside Workflow DevKit's durable state, reachable by `workflow
     * inspect` but not by SQL — so the one place an author says, in their own
     * words, what the plan got wrong was invisible to everything.
     */
    approvalNotes: text("approval_notes"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /**
     * `start()` was invoked but its response was lost. The row stays active
     * until the Workflow self-links or one rate-limited same-run retry claims
     * this marker.
     */
    acceptanceUncertainAt: timestamp("acceptance_uncertain_at", { withTimezone: true }),
    /** Lease for one external Workflow dispatch attempt; stale claims are retryable. */
    acceptanceDispatchClaimedAt: timestamp("acceptance_dispatch_claimed_at", {
      withTimezone: true,
    }),
    /** Last time the Workflow-aware watchdog attempted to reconcile this run. */
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_runs_project").on(t.projectId, t.createdAt),
    index("idx_runs_status").on(t.status),
    index("idx_runs_health_check").on(t.status, t.healthCheckedAt, t.createdAt),
    uniqueIndex("uq_runs_support_reference").on(t.supportReference),
    uniqueIndex("uq_runs_id_project").on(t.id, t.projectId),
    uniqueIndex("uq_runs_id_user").on(t.id, t.userId),
    check(
      "generation_runs_current_stage_check",
      sql`${t.currentStage} in (
        'queued', 'concept', 'awaiting_guidance', 'outline', 'awaiting_approval', 'awaiting_credits',
        'bible', 'chapters', 'editing', 'continuity', 'revising',
        'finalizing', 'done', 'failed', 'cancelled'
      )`,
    ),
    check("generation_runs_progress_pct_check", sql`${t.progressPct} between 0 and 100`),
    check(
      "generation_runs_workflow_observed_status_check",
      sql`${t.workflowObservedStatus} is null or ${t.workflowObservedStatus} in (
        'pending', 'running', 'completed', 'failed', 'cancelled', 'missing', 'unavailable'
      )`,
    ),
    check("generation_runs_workflow_missing_count_check", sql`${t.workflowMissingCount} >= 0`),
    check("generation_runs_dispatch_attempts_check", sql`${t.dispatchAttempts} between 0 and 3`),
    check("generation_runs_pause_version_check", sql`${t.pauseVersion} >= 0`),
    check("generation_runs_next_event_seq_check", sql`${t.nextEventSeq} >= 1`),
    // Race-proof backstop for the "one active generation per project" rule.
    // Export runs are excluded so exports stay independent of generation.
    uniqueIndex("uq_runs_active_per_project")
      .on(t.projectId)
      .where(sql`status in ('queued','running','awaiting_input') and kind <> 'export'`),
    uniqueIndex("uq_runs_project_request_key").on(t.projectId, t.requestKey),
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
    /** Stable Workflow step identifier; null only on historical events. */
    eventKey: text("event_key"),
    type: text("type").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_seq").on(t.runId, t.seq),
    uniqueIndex("uq_event_key")
      .on(t.runId, t.eventKey)
      .where(sql`${t.eventKey} is not null`),
    check("generation_events_seq_check", sql`${t.seq} >= 1`),
  ],
);

/**
 * Short-lived database-backed caps for long-running Workflow stream readers.
 * A process crash needs no cleanup job: the next acquisition removes expired
 * leases before counting. The run/user composite FK prevents attribution drift.
 */
export const authoringStreamLeases = pgTable(
  "authoring_stream_leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    userId: text("user_id").notNull(),
    namespace: text("namespace").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "authoring_stream_leases_run_user_generation_runs_fk",
      columns: [t.runId, t.userId],
      foreignColumns: [generationRuns.id, generationRuns.userId],
    }).onDelete("cascade"),
    index("idx_authoring_stream_leases_active").on(t.runId, t.userId, t.expiresAt),
    index("idx_authoring_stream_leases_user").on(t.userId, t.expiresAt),
    check(
      "authoring_stream_leases_namespace_check",
      sql`${t.namespace} = 'progress' or ${t.namespace} ~ '^chapter:[1-9][0-9]{0,3}$'`,
    ),
    check("authoring_stream_leases_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export type AuthoringRunInputKind = "outline_approval" | "credits_topup" | "creative_decision";
export type AuthoringPauseDetails = {
  balanceCredits?: number;
  requiredCredits?: number;
  resumeStage?: string;
  questionId?: string;
};

/**
 * Durable, versioned human input. The route commits here before signaling the
 * Workflow hook, so response loss and hook delivery retries never duplicate an
 * approval or top-up.
 */
export const authoringRunInputs = pgTable(
  "authoring_run_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => generationRuns.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["outline_approval", "credits_topup", "creative_decision"],
    }).notNull(),
    pauseVersion: integer("pause_version").notNull(),
    requestKey: uuid("request_key").defaultRandom().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status", { enum: ["accepted", "delivered", "consumed"] })
      .default("accepted")
      .notNull(),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    lastDeliveryError: text("last_delivery_error"),
  },
  (t) => [
    uniqueIndex("uq_authoring_run_input_pause").on(t.runId, t.kind, t.pauseVersion),
    uniqueIndex("uq_authoring_run_input_request").on(t.runId, t.requestKey),
    index("idx_authoring_run_inputs_delivery").on(t.status, t.acceptedAt),
    check("authoring_run_inputs_pause_version_check", sql`${t.pauseVersion} >= 1`),
    check("authoring_run_inputs_delivery_attempts_check", sql`${t.deliveryAttempts} >= 0`),
    check(
      "authoring_run_inputs_status_check",
      sql`${t.status} in ('accepted', 'delivered', 'consumed')`,
    ),
    check(
      "authoring_run_inputs_kind_check",
      sql`${t.kind} in ('outline_approval', 'credits_topup', 'creative_decision')`,
    ),
  ],
);

/**
 * One durable, run-owned creative decision. Question text stays out of the
 * operational event/incident streams and is exposed only through an
 * authenticated run-health response.
 */
export const authoringQuestions = pgTable(
  "authoring_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    projectId: uuid("project_id").notNull(),
    questionKey: text("question_key").notNull(),
    stage: text("stage", { enum: ["after_concept"] }).notNull(),
    prompt: text("prompt").notNull(),
    rationale: text("rationale"),
    options: jsonb("options").$type<AuthoringQuestionOption[]>().notNull(),
    recommendedOptionId: text("recommended_option_id").notNull(),
    decisionDigest: text("decision_digest").notNull(),
    pauseVersion: integer("pause_version"),
    status: text("status", { enum: ["pending", "answered"] })
      .default("pending")
      .notNull(),
    inputId: uuid("input_id").references(() => authoringRunInputs.id, {
      onDelete: "set null",
    }),
    decision: jsonb("decision").$type<AuthoringQuestionDecision | null>(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "authoring_questions_run_project_generation_runs_fk",
      columns: [t.runId, t.projectId],
      foreignColumns: [generationRuns.id, generationRuns.projectId],
    }).onDelete("cascade"),
    uniqueIndex("uq_authoring_question_run_key").on(t.runId, t.questionKey),
    uniqueIndex("uq_authoring_question_pause")
      .on(t.runId, t.pauseVersion)
      .where(sql`${t.pauseVersion} is not null`),
    uniqueIndex("uq_authoring_question_input")
      .on(t.inputId)
      .where(sql`${t.inputId} is not null`),
    index("idx_authoring_questions_pending").on(t.runId, t.status),
    check("authoring_questions_options_count_check", sql`jsonb_array_length(${t.options}) = 3`),
    check(
      "authoring_questions_pause_version_check",
      sql`${t.pauseVersion} is null or ${t.pauseVersion} >= 1`,
    ),
    check("authoring_questions_status_check", sql`${t.status} in ('pending', 'answered')`),
    check("authoring_questions_stage_check", sql`${t.stage} = 'after_concept'`),
  ],
);

export type AuthoringIncidentEvidence = Record<string, string | number | boolean | null>;

/**
 * Idempotent, content-free operational evidence. One unresolved incident
 * exists per run/dedupe key; repeated watchdog observations update it rather
 * than creating alert noise.
 */
export const authoringIncidents = pgTable(
  "authoring_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    projectId: uuid("project_id").notNull(),
    category: text("category", {
      enum: [
        "dispatch",
        "workflow_missing",
        "stalled_heartbeat",
        "invalid_pause",
        "completion_contradiction",
        "cancellation_unconfirmed",
        "stale_reservation",
        "event_persistence",
        "unresolved_metering",
        "operator_action",
      ],
    }).notNull(),
    severity: text("severity", { enum: ["warning", "critical"] }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    evidence: jsonb("evidence").$type<AuthoringIncidentEvidence>().default({}).notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).defaultNow().notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_authoring_incident_active")
      .on(t.runId, t.dedupeKey)
      .where(sql`${t.resolvedAt} is null`),
    index("idx_authoring_incidents_project").on(t.projectId, t.resolvedAt, t.severity),
    index("idx_authoring_incidents_active").on(t.resolvedAt, t.severity, t.lastObservedAt),
    foreignKey({
      name: "authoring_incidents_run_project_generation_runs_fk",
      columns: [t.runId, t.projectId],
      foreignColumns: [generationRuns.id, generationRuns.projectId],
    }).onDelete("cascade"),
    check("authoring_incidents_occurrence_count_check", sql`${t.occurrenceCount} >= 1`),
    check("authoring_incidents_severity_check", sql`${t.severity} in ('warning', 'critical')`),
    check(
      "authoring_incidents_category_check",
      sql`${t.category} in (
        'dispatch', 'workflow_missing', 'stalled_heartbeat', 'invalid_pause',
        'completion_contradiction', 'cancellation_unconfirmed',
        'stale_reservation', 'event_persistence', 'unresolved_metering', 'operator_action'
      )`,
    ),
  ],
);

// Ground truth for cost metering and margin analysis.
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      // Cascade so Clerk account deletion can remove the user row cleanly.
      .references(() => users.id, { onDelete: "cascade" }),
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
    /**
     * Dollars actually charged, on purchase and refund rows only.
     *
     * Credits are not dollars once bonuses exist: the Author pack is $60 for 66
     * credits, so summing purchase credits overstated revenue by the bonus on
     * every tier. This is the number that reconciles with Stripe.
     */
    usdPaid: numeric("usd_paid", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_ledger_user").on(t.userId, t.createdAt),
    // Idempotency: one credit entry per Stripe object, enforced by the database
    // rather than by application logic that a retry could race.
    uniqueIndex("uq_ledger_external_ref").on(t.externalRef),
  ],
);

export type SuggestionAnchor = {
  start: number;
  end: number;
  originalText: string;
  /** Ordinal among identical matches of originalText (0 = first). Absent on legacy/review rows. */
  occurrence?: number;
  /** Stable paid-operation key used to replay a delivered selection edit without another model call. */
  operationKey?: string;
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
    /**
     * What the author actually asked for. Went into the prompt and was then
     * discarded, so the record showed the model's answer with no trace of the
     * question — useless for understanding a complaint about a bad rewrite,
     * and the single most direct signal of what people want from the editor.
     * Null on rows written before this existed, and on passes with no
     * instruction.
     */
    instruction: text("instruction"),
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

/**
 * Quiet content-safety review. Rows are written by the moderation checks that
 * ride the concept and summarizer calls; nothing here is ever shown to the
 * author. "Inappropriate" means provider-AUP / illegal categories only — the
 * product deliberately writes explicit fiction when its settings ask for it,
 * so heat level alone is never a flag.
 */
export const moderationFlags = pgTable(
  "moderation_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number"),
    source: text("source", { enum: ["brief", "chapter"] }).notNull(),
    category: text("category").notNull(),
    severity: text("severity", { enum: ["review", "urgent"] })
      .default("review")
      .notNull(),
    excerpt: text("excerpt"),
    detail: text("detail"),
    status: text("status", { enum: ["open", "dismissed", "actioned"] })
      .default("open")
      .notNull(),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_flags_status").on(t.status, t.createdAt)],
);

export const contentToolRuns = pgTable(
  "content_tool_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      // Cascade so Clerk account deletion can remove the user row cleanly.
      .references(() => users.id, { onDelete: "cascade" }),
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

/**
 * Immutable editions power revocable reader links. A live book may continue
 * changing after it is shared; the reader must never drift underneath someone
 * who was sent a particular edition.
 */
export const publicationEditions = pgTable(
  "publication_editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceDigest: text("source_digest").notNull(),
    snapshot: jsonb("snapshot").$type<PublicationEditionSnapshot>().notNull(),
    incomplete: boolean("incomplete").default(false).notNull(),
    chapterCount: integer("chapter_count").notNull(),
    totalWords: integer("total_words").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "publication_editions_book_project_fk",
      columns: [t.bookId, t.projectId],
      foreignColumns: [books.id, books.projectId],
    }).onDelete("cascade"),
    uniqueIndex("uq_publication_edition_source").on(t.projectId, t.sourceDigest),
    unique("uq_publication_edition_id_project_user").on(t.id, t.projectId, t.userId),
    index("idx_publication_editions_owner").on(t.userId, t.projectId, t.createdAt),
    check("publication_editions_digest_check", sql`length(${t.sourceDigest}) = 64`),
    check("publication_editions_chapter_count_check", sql`${t.chapterCount} > 0`),
    check("publication_editions_total_words_check", sql`${t.totalWords} > 0`),
  ],
);

/**
 * The raw 256-bit bearer token is returned once and never stored. Only its
 * SHA-256 digest reaches the database, so a database read cannot reveal live
 * reader URLs. Authors can revoke a link or create a replacement at any time.
 */
export const readerShares = pgTable(
  "reader_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id").notNull(),
    projectId: uuid("project_id").notNull(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    status: text("status", { enum: ["active", "revoked"] })
      .default("active")
      .notNull(),
    allowDownload: boolean("allow_download").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "reader_shares_edition_project_user_fk",
      columns: [t.editionId, t.projectId, t.userId],
      foreignColumns: [
        publicationEditions.id,
        publicationEditions.projectId,
        publicationEditions.userId,
      ],
    }).onDelete("cascade"),
    uniqueIndex("uq_reader_shares_token_hash").on(t.tokenHash),
    index("idx_reader_shares_owner").on(t.userId, t.projectId, t.createdAt),
    index("idx_reader_shares_active").on(t.status, t.expiresAt),
    check("reader_shares_token_hash_check", sql`length(${t.tokenHash}) = 64`),
    check(
      "reader_shares_status_check",
      sql`(${t.status} = 'active' and ${t.revokedAt} is null)
        or (${t.status} = 'revoked' and ${t.revokedAt} is not null)`,
    ),
    check(
      "reader_shares_expiry_check",
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);

/**
 * Product analytics events.
 *
 * Deliberately small. Postgres already answers almost every business question
 * from the tables above — signups, first-book conversion, purchases, repeat
 * purchase, revenue against COGS — because all of those leave a durable row
 * behind. This table exists for the questions that leave no row: the wizard is
 * localStorage-only until submit, so step-level drop-off is invisible, and a
 * visitor who bounces off pricing never appears anywhere.
 *
 * Money never comes from here. credit_ledger stays the source of truth for
 * anything financial; this is for behaviour only, and it is allowed to be
 * lossy (fire-and-forget writes, no retry).
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Closed union, enforced at the route. Free-form names make this unusable. */
    name: text("name").notNull(),
    /** Null before sign-up — that is most of the funnel. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    /**
     * First-party random id from a cookie, so a pre-signup session can be
     * stitched to the account it becomes. Not an identifier of a person and
     * never derived from one.
     */
    anonId: text("anon_id"),
    props: jsonb("props").$type<Record<string, string | number | boolean>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_events_name_created").on(t.name, t.createdAt),
    index("idx_events_anon").on(t.anonId, t.createdAt),
  ],
);
