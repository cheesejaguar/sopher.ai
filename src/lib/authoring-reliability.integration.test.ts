import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { schema } from "@/db";
import {
  getAuthoringJourneySnapshot,
  listAuthoringJourneySnapshots,
} from "@/db/queries/authoring-journey";
import { getLatestAuthoringJourneyRun } from "@/db/queries/books";
import {
  acceptAuthoringRunInput,
  allocateAuthoringPause,
  consumeAuthoringRunInput,
  markAuthoringPauseRegistered,
} from "@/lib/authoring-inputs";
import {
  AuthoringCancellationRequestedError,
  throwIfAuthoringCancellationRequested,
} from "@/lib/authoring-cancellation";
import { persistRunEvent } from "@/lib/run-event-store";
import type { GenerationConfig } from "@/lib/run-events";
import {
  claimUncertainAuthoringRun,
  insertQueuedAuthoringRun,
  requestAuthoringRunCancellation,
  transitionAuthoringRunState,
} from "@/lib/generation-runs";
import { getAuthoringStartSafetyBlock } from "@/lib/authoring-start-safety";
import { resolveReconciledMeteringIncidents } from "@/lib/billing/unresolved-metering";
import {
  reconcileMeteredCallAsCharged,
  reconcileMeteredCallAsUncharged,
} from "@/lib/billing/meter";
import {
  hydratePreManuscriptRetryStep,
  prepareCreativeQuestionStep,
  withActiveAuthoringMutation,
} from "@/workflows/steps";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;

  if (isolated !== "1") {
    throw new Error("Refusing reliability integration tests without E2E_DATABASE_ISOLATED=1.");
  }
  if (!value) {
    throw new Error("E2E_DATABASE_URL must identify the disposable database branch.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing reliability integration tests in NODE_ENV=production.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("E2E_DATABASE_URL must be a PostgreSQL connection URL with a hostname.");
  }
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error(
      "E2E_DATABASE_HOST must exactly match the disposable database branch hostname.",
    );
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("authoring reliability against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-authoring-reliability-${suffix}`;
  const pauseProjectId = randomUUID();
  const pauseRunId = randomUUID();
  const pauseBookId = randomUUID();
  const pauseChapterId = randomUUID();
  const dispatchProjectId = randomUUID();
  const dispatchRunId = randomUUID();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Isolated database URL disappeared before test setup.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);

    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values
        (
          ${pauseProjectId}, ${userId}, 'Pause reliability fixture',
          'A disposable fixture for durable author input.', 'fantasy',
          'full_book', 3, 1000, '{}'::jsonb
        ),
        (
          ${dispatchProjectId}, ${userId}, 'Dispatch reliability fixture',
          'A disposable fixture for same-run recovery.', 'mystery',
          'full_book', 3, 1000, '{}'::jsonb
        )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct
      )
      values
        (
          ${pauseRunId}, ${pauseProjectId}, ${userId}, ${randomUUID()},
          'full_book', 'running',
          '{"protocolVersion":2,"dispatchReady":true,"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          'outline', 12
        ),
        (
          ${dispatchRunId}, ${dispatchProjectId}, ${userId}, ${randomUUID()},
          'full_book', 'queued',
          '{"protocolVersion":2,"dispatchReady":true,"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          'queued', 0
        )
    `;
    await observer`
      insert into books (id, project_id, title)
      values (${pauseBookId}, ${pauseProjectId}, 'Reliability manuscript')
    `;
    await observer`
      insert into chapters (id, book_id, chapter_number, title, content, word_count, status)
      values (
        ${pauseChapterId}, ${pauseBookId}, 1, 'Opening',
        'The original chapter.', 3, 'drafted'
      )
    `;
    await observer`
      update generation_runs
      set
        acceptance_uncertain_at = now() - interval '5 minutes',
        acceptance_dispatch_claimed_at = null,
        dispatch_attempts = 2
      where id = ${dispatchRunId}
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("allocates one replay-safe pause version before making it actionable", async () => {
    const first = await allocateAuthoringPause({
      runId: pauseRunId,
      projectId: pauseProjectId,
      userId,
      kind: "outline_approval",
      pauseKey: "outline-review:version-1",
      details: { resumeStage: "bible" },
    });
    const replay = await allocateAuthoringPause({
      runId: pauseRunId,
      projectId: pauseProjectId,
      userId,
      kind: "outline_approval",
      pauseKey: "outline-review:version-1",
      details: { resumeStage: "bible" },
    });

    expect(first).toMatchObject({
      kind: "outline_approval",
      version: 1,
      registeredAt: null,
    });
    expect(replay).toEqual(first);
    const [beforeRegistration] = (await observer!`
        select status, pause_version as "pauseVersion", pause_registered_at as "registeredAt"
        from generation_runs
        where id = ${pauseRunId}
      `) as unknown as Array<{
      status: string;
      pauseVersion: number;
      registeredAt: string | null;
    }>;
    expect(beforeRegistration).toMatchObject({
      status: "running",
      pauseVersion: 1,
      registeredAt: null,
    });

    await expect(
      markAuthoringPauseRegistered({
        runId: pauseRunId,
        projectId: pauseProjectId,
        userId,
        kind: "outline_approval",
        pauseVersion: 1,
      }),
    ).resolves.toBe(true);
    const [afterRegistration] = (await observer!`
        select status, pause_registered_at as "registeredAt"
        from generation_runs
        where id = ${pauseRunId}
      `) as unknown as Array<{ status: string; registeredAt: string | null }>;
    expect(afterRegistration?.status).toBe("awaiting_input");
    expect(afterRegistration?.registeredAt).not.toBeNull();
  });

  it("hydrates only exact-input guided checkpoints before manuscript preparation", async () => {
    const projectId = randomUUID();
    const sourceRunId = randomUUID();
    const retryRunId = randomUUID();
    const incompatibleRunId = randomUUID();
    const inputSnapshot = {
      workingTitle: "The Cartographer's Door",
      brief: "A cartographer follows a road that disappears behind her.",
      genre: "Fantasy",
      styleGuide: null,
      voiceProfile: null,
      pov: "third_limited",
      tense: "past",
      tone: "wondrous",
      styleProfile: null,
      heatLevel: "none",
      violenceLevel: "mild",
      profanity: "none",
      avoidTopics: [],
    };
    const shape = {
      protocolVersion: 3,
      interaction: { mode: "guided", maxQuestions: 1 },
      productionMode: "full_book",
      tier: "standard",
      requireOutlineApproval: true,
      waveSize: 4,
      targetChapters: 3,
      targetWordsPerChapter: 1000,
      inputSnapshot,
    };
    const concept = {
      title: "The Cartographer's Door",
      logline: "A disappearing road leads beyond the edge of every map.",
      synopsis: "Mara follows a living road into a city erased from memory.",
      themes: ["memory", "belonging"],
      setting: "A borderland crossed by living roads",
      centralConflict: "Mara must map a place that refuses to remain found.",
      uniqueElements: ["living maps"],
      characters: [],
      moderation: { flagged: false },
    };
    const decision = {
      questionId: randomUUID(),
      questionKey: "after_concept",
      mode: "option",
      selectedOptionId: "option-2",
      answer: "Follow the road into the archive the city tried to forget.",
    };
    const sourceConfig = {
      ...shape,
      stagedConcept: concept,
      creativeDecisions: { afterConcept: decision },
      preparation: { manuscriptReset: true },
      work: {
        conceptExpanded: concept,
        outline: { revisionNotes: null, plan: { beats: ["arrival", "choice"] } },
        chapters: { "1": { draft: "This manuscript work must stay behind." } },
      },
      completion: {
        chapterSummaries: {
          "1": { sourceRunId, contentDigest: "unsafe-manuscript-checkpoint" },
        },
      },
    };
    const retryConfig = {
      ...shape,
      resumeFromRunId: sourceRunId,
      billingLineageRunId: sourceRunId,
    };

    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, ${inputSnapshot.workingTitle}, ${inputSnapshot.brief},
        'Fantasy', 'full_book', 3, 1000, '{"authoringMode":"guided"}'::jsonb
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config
      )
      values
        (
          ${sourceRunId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', 'failed',
          ${JSON.stringify(sourceConfig)}::jsonb
        ),
        (
          ${retryRunId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', 'running',
          ${JSON.stringify(retryConfig)}::jsonb
        )
    `;

    await expect(
      hydratePreManuscriptRetryStep(
        { dbRunId: retryRunId, projectId, userId },
        retryConfig as Parameters<typeof hydratePreManuscriptRetryStep>[1],
      ),
    ).resolves.toEqual({ inherited: true, pendingQuestion: false });
    const [hydrated] = (await observer!`
      select config
      from generation_runs
      where id = ${retryRunId}
    `) as unknown as Array<{ config: Partial<GenerationConfig> }>;
    expect(hydrated?.config).toMatchObject({
      stagedConcept: concept,
      creativeDecisions: { afterConcept: decision },
      work: {
        conceptExpanded: concept,
        outline: sourceConfig.work.outline,
      },
      resumeFromRunId: sourceRunId,
      billingLineageRunId: sourceRunId,
    });
    expect(hydrated?.config.work).not.toHaveProperty("chapters");
    expect(hydrated?.config).not.toHaveProperty("preparation");
    expect(hydrated?.config).not.toHaveProperty("completion");
    expect(hydrated?.config).not.toHaveProperty("manuscriptPrepared");
    await expect(
      prepareCreativeQuestionStep(
        { dbRunId: retryRunId, projectId, userId },
        retryConfig as Parameters<typeof prepareCreativeQuestionStep>[1],
        concept,
      ),
    ).resolves.toBeNull();

    const incompatibleConfig = {
      ...retryConfig,
      inputSnapshot: { ...inputSnapshot, brief: "A changed author brief." },
    };
    await observer!`
      update generation_runs
      set status = 'failed', current_stage = 'failed', completed_at = now()
      where id = ${retryRunId}
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config
      )
      values (
        ${incompatibleRunId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', 'running',
        ${JSON.stringify(incompatibleConfig)}::jsonb
      )
    `;
    await expect(
      hydratePreManuscriptRetryStep(
        { dbRunId: incompatibleRunId, projectId, userId },
        incompatibleConfig as Parameters<typeof hydratePreManuscriptRetryStep>[1],
      ),
    ).resolves.toEqual({ inherited: false, pendingQuestion: false });
    const [incompatible] = (await observer!`
      select config
      from generation_runs
      where id = ${incompatibleRunId}
    `) as unknown as Array<{ config: Partial<GenerationConfig> }>;
    expect(incompatible?.config).not.toHaveProperty("stagedConcept");
    expect(incompatible?.config).not.toHaveProperty("creativeDecisions");
  });

  it("accepts concurrent response-loss retries once and consumes the stored answer idempotently", async () => {
    const firstPayload = {
      decision: "approved",
      metadata: { revision: 1, source: "outline" },
    };
    const reorderedPayload = {
      metadata: { source: "outline", revision: 1 },
      decision: "approved",
    };
    const [first, retry] = await Promise.all([
      acceptAuthoringRunInput({
        runId: pauseRunId,
        userId,
        kind: "outline_approval",
        pauseVersion: 1,
        requestKey: randomUUID(),
        payload: firstPayload,
      }),
      acceptAuthoringRunInput({
        runId: pauseRunId,
        userId,
        kind: "outline_approval",
        pauseVersion: 1,
        requestKey: randomUUID(),
        payload: reorderedPayload,
      }),
    ]);

    expect([first.replayed, retry.replayed].sort()).toEqual([false, true]);
    expect(first.input.id).toBe(retry.input.id);
    const rows = await observer!`
      select id, status
      from authoring_run_inputs
      where run_id = ${pauseRunId}
    `;
    expect(rows).toHaveLength(1);

    await expect(
      consumeAuthoringRunInput({
        runId: pauseRunId,
        kind: "outline_approval",
        pauseVersion: 1,
        inputId: first.input.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ decision: "approved" }));
    await expect(
      consumeAuthoringRunInput({
        runId: pauseRunId,
        kind: "outline_approval",
        pauseVersion: 1,
        inputId: first.input.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ decision: "approved" }));

    const [consumed] = (await observer!`
      select status, consumed_at as "consumedAt"
      from authoring_run_inputs
      where id = ${first.input.id}
    `) as unknown as Array<{ status: string; consumedAt: string | null }>;
    expect(consumed).toMatchObject({ status: "consumed" });
    expect(consumed?.consumedAt).not.toBeNull();
  });

  it("allocates unique monotonic event sequences under concurrency and replays one stable key", async () => {
    const writes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        persistRunEvent({
          runId: pauseRunId,
          eventKey: `workflow-step:reliability:${index + 1}`,
          event: {
            type: "stage",
            stage: index < 4 ? "chapters" : "editing",
            pct: 20 + index * 5,
            detail: `Reliability step ${index + 1}`,
          },
        }),
      ),
    );
    expect(writes.every((write) => write.inserted)).toBe(true);
    expect(writes.map((write) => write.seq).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const replay = await persistRunEvent({
      runId: pauseRunId,
      eventKey: "workflow-step:reliability:4",
      event: {
        type: "stage",
        stage: "chapters",
        pct: 35,
        detail: "Reliability step 4",
      },
    });
    expect(replay).toMatchObject({ inserted: false });
    expect(replay.seq).toBe(writes[3]?.seq);

    const eventRows = (await observer!`
      select seq, event_key as "eventKey"
      from generation_events
      where run_id = ${pauseRunId}
      order by seq
    `) as unknown as Array<{ seq: number; eventKey: string }>;
    expect(eventRows).toHaveLength(8);
    expect(eventRows.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const [run] = (await observer!`
      select next_event_seq as "nextEventSeq"
      from generation_runs
      where id = ${pauseRunId}
    `) as unknown as Array<{ nextEventSeq: number }>;
    expect(run?.nextEventSeq).toBe(9);

    // A deployment-pinned v1 Workflow may still insert with max(seq)+1 after
    // the migration backfill. The v2 allocator must catch up under its lock.
    await observer!`
      insert into generation_events (run_id, seq, type, payload)
      values (
        ${pauseRunId}, 20, 'stage',
        '{"type":"stage","stage":"chapters","pct":60}'::jsonb
      )
    `;
    const afterLegacy = await persistRunEvent({
      runId: pauseRunId,
      eventKey: "workflow-step:after-pinned-v1",
      event: {
        type: "stage",
        stage: "chapters",
        pct: 65,
        detail: "Current deployment after pinned v1 event",
      },
    });
    expect(afterLegacy).toMatchObject({ inserted: true, seq: 21 });
    const [advanced] = (await observer!`
      select next_event_seq as "nextEventSeq"
      from generation_runs
      where id = ${pauseRunId}
    `) as unknown as Array<{ nextEventSeq: number }>;
    expect(advanced?.nextEventSeq).toBe(22);
  });

  it("keeps failed full-book recovery authoritative over terminal scoped work while active authoring retains priority", async () => {
    const projectId = randomUUID();
    const failedFullBookRunId = randomUUID();
    const completedScopedRunId = randomUUID();
    const activeScopedRunId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Journey run selection fixture',
        'A disposable fixture for scoped recovery.', 'mystery',
        'full_book', 3, 1000, '{}'::jsonb
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config, created_at
      )
      values
        (
          ${failedFullBookRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'full_book', 'failed',
          '{"protocolVersion":2,"targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          now() - interval '2 minutes'
        ),
        (
          ${completedScopedRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'edit_pass', 'completed', '{}'::jsonb, now() - interval '1 minute'
        )
    `;

    await expect(getLatestAuthoringJourneyRun(projectId)).resolves.toMatchObject({
      id: failedFullBookRunId,
      kind: "full_book",
      status: "failed",
    });

    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config, created_at
      )
      values (
        ${activeScopedRunId}, ${projectId}, ${userId}, ${randomUUID()},
        'chapter', 'running', '{}'::jsonb, now() - interval '5 minutes'
      )
    `;
    await expect(getLatestAuthoringJourneyRun(projectId)).resolves.toMatchObject({
      id: activeScopedRunId,
      kind: "chapter",
      status: "running",
    });
  });

  it("keeps failed full-book recovery consistent in the library and open project after scoped work", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const failedFullBookRunId = randomUUID();
    const completedScopedRunId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Interrupted full-book fixture',
        'A saved chapter still needs the whole-book recovery path.', 'mystery',
        'full_book', 3, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Interrupted full-book fixture')
    `;
    await observer!`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (
        ${randomUUID()}, ${bookId}, 1, 'Saved opening',
        'The first chapter remains safely stored.', 6, 'edited'
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct, created_at
      )
      values
        (
          ${failedFullBookRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'full_book', 'failed',
          ${JSON.stringify({
            protocolVersion: 2,
            tier: "standard",
            targetChapters: 3,
            targetWordsPerChapter: 1000,
            work: { chapters: { "1": { draft: "durable-checkpoint" } } },
          })}::jsonb,
          'failed', 34, now() - interval '2 minutes'
        ),
        (
          ${completedScopedRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'edit_pass', 'completed',
          '{"protocolVersion":2,"targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          'done', 100, now() - interval '1 minute'
        )
    `;

    const access = { fullBookUnlocked: true, balanceCredits: 100 };
    const library = await listAuthoringJourneySnapshots(userId, access);
    const openProject = await getAuthoringJourneySnapshot({
      userId,
      projectId,
      access,
    });
    const libraryProject = library.find((snapshot) => snapshot.project.id === projectId);

    expect(libraryProject?.run).toMatchObject({
      id: failedFullBookRunId,
      kind: "full_book",
      effectiveStatus: "failed",
    });
    expect(openProject?.run).toMatchObject({
      id: failedFullBookRunId,
      kind: "full_book",
      effectiveStatus: "failed",
    });
    expect(libraryProject?.nextAction).toEqual(openProject?.nextAction);
    expect(openProject?.nextAction).toMatchObject({
      kind: "recover_saved_work",
      href: `/projects/${projectId}/write#authoring-recovery`,
    });
  });

  it("blocks a replacement run while its billing lineage has unresolved provider evidence", async () => {
    const projectId = randomUUID();
    const rootRunId = randomUUID();
    const retryRunId = randomUUID();
    const intentRef = `metering-intent:generation:${rootRunId}:creative-question:after-concept:creative.question:attempt:test`;
    const secondIntentRef = `metering-intent:generation:${rootRunId}:outline:creative.outline:attempt:second`;
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Unresolved metering fixture',
        'A failed provider attempt must be reconciled before retry.', 'mystery',
        'full_book', 3, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct, error, root_error_code, root_error_stage, created_at
      )
      values
        (
          ${rootRunId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', 'failed',
          ${JSON.stringify({ protocolVersion: 2, tier: "standard" })}::jsonb,
          'failed', 2, 'A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.',
          'metering_reconciliation_required', 'concept', now() - interval '2 minutes'
        ),
        (
          ${retryRunId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', 'failed',
          ${JSON.stringify({
            protocolVersion: 2,
            tier: "standard",
            resumeFromRunId: rootRunId,
            billingLineageRunId: rootRunId,
          })}::jsonb,
          'failed', 2, 'A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.',
          'metering_reconciliation_required', 'concept', now() - interval '1 minute'
        )
    `;
    await observer!`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref, created_at
      )
      values
        (${userId}, 100, 'purchase', 'Entitled test wallet', ${projectId}, null,
          ${`test-purchase:${projectId}`}, now() - interval '3 hours'),
        (${userId}, 0, 'adjustment', 'Metering intent for creative.question',
          ${projectId}, ${rootRunId}, ${intentRef}, now() - interval '2 hours'),
        (${userId}, -0.275, 'adjustment', 'Provider claim',
          ${projectId}, ${rootRunId}, ${`metering-claim:${intentRef}`}, now() - interval '2 hours'),
        (${userId}, 0, 'adjustment', 'Second metering intent',
          ${projectId}, ${rootRunId}, ${secondIntentRef}, now() - interval '2 hours'),
        (${userId}, -0.275, 'adjustment', 'Second provider claim',
          ${projectId}, ${rootRunId}, ${`metering-claim:${secondIntentRef}`}, now() - interval '2 hours')
    `;
    await observer!`
      insert into authoring_incidents (
        run_id, project_id, category, severity, dedupe_key, evidence
      )
      values (
        ${retryRunId}, ${projectId}, 'unresolved_metering', 'critical',
        'unresolved-metering', '{"errorCode":"metering_reconciliation_required"}'::jsonb
      )
    `;

    const access = { fullBookUnlocked: true, balanceCredits: 100 };
    const library = await listAuthoringJourneySnapshots(userId, access);
    const openProject = await getAuthoringJourneySnapshot({ userId, projectId, access });
    const libraryProject = library.find((snapshot) => snapshot.project.id === projectId);

    expect(libraryProject?.run?.id).toBe(retryRunId);
    expect(libraryProject?.nextAction.kind).toBe("contact_support");
    expect(libraryProject?.purchaseAction).toBeNull();
    expect(openProject?.nextAction.kind).toBe("contact_support");
    await expect(getAuthoringStartSafetyBlock({ userId, projectId })).resolves.toMatchObject({
      code: "support_required",
      action: { kind: "contact_support", requiresMeteredAccess: false },
    });

    await expect(
      reconcileMeteredCallAsCharged({
        intentRef,
        adminId: "integration-test",
        note: "Exact Gateway attempt verified; output was not delivered.",
        calls: [
          {
            model: "anthropic/claude-sonnet-5",
            inputTokens: 2,
            outputTokens: 537,
          },
        ],
      }),
    ).resolves.toMatchObject({ debitedCredits: expect.any(Number) });
    await expect(resolveReconciledMeteringIncidents(intentRef)).resolves.toBe(0);

    const afterFirst = await getAuthoringJourneySnapshot({ userId, projectId, access });
    expect(afterFirst?.nextAction.kind).toBe("contact_support");
    const chargedLedger = (await observer!`
      select external_ref as "externalRef", amount::text, kind
      from credit_ledger
      where external_ref in (
        ${`metering-claim:${intentRef}`},
        ${`release:metering-claim:${intentRef}`},
        ${`intent-settled:${intentRef}`},
        ${`delivery-refund:llm:generation:${rootRunId}:creative-question:after-concept:creative.question:attempt:test`},
        ${`llm:generation:${rootRunId}:creative-question:after-concept:creative.question:attempt:test:step:0`}
      )
    `) as unknown as Array<{ externalRef: string; amount: string; kind: string }>;
    expect(chargedLedger.map((row) => row.externalRef)).toEqual(
      expect.arrayContaining([
        `release:metering-claim:${intentRef}`,
        `intent-settled:${intentRef}`,
        `delivery-refund:llm:generation:${rootRunId}:creative-question:after-concept:creative.question:attempt:test`,
      ]),
    );
    expect(chargedLedger.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(0, 6);
    const [verifiedCall] = (await observer!`
      select input_tokens::int as "inputTokens", output_tokens::int as "outputTokens"
      from llm_calls
      where run_id = ${rootRunId} and operation = 'creative.question'
    `) as unknown as Array<{ inputTokens: number; outputTokens: number }>;
    expect(verifiedCall).toEqual({ inputTokens: 2, outputTokens: 537 });

    await expect(
      reconcileMeteredCallAsUncharged({
        intentRef: secondIntentRef,
        adminId: "integration-test",
        note: "Gateway verified that the second provider attempt was uncharged.",
      }),
    ).resolves.toBe(true);
    await expect(resolveReconciledMeteringIncidents(secondIntentRef)).resolves.toBeGreaterThan(0);

    const reconciled = await getAuthoringJourneySnapshot({ userId, projectId, access });
    expect(reconciled?.nextAction.kind).toBe("recover_saved_work");
    await expect(getAuthoringStartSafetyBlock({ userId, projectId })).resolves.toBeNull();
  });

  it("derives the same next action for a successful scoped retry in the library and open project", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const chapterId = randomUUID();
    const failedScopedRunId = randomUUID();
    const completedScopedRunId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Journey action parity fixture',
        'A completed edit should supersede its failed attempt.', 'mystery',
        'full_book', 1, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Journey action parity fixture')
    `;
    await observer!`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (
        ${chapterId}, ${bookId}, 1, 'Opening',
        'The corrected chapter remains available to edit.', 7, 'edited'
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config, created_at
      )
      values
        (
          ${failedScopedRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'edit_pass', 'failed', '{}'::jsonb, now() - interval '2 minutes'
        ),
        (
          ${completedScopedRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'edit_pass', 'completed',
          ${JSON.stringify({
            tier: "standard",
            targetChapters: 1,
            targetWordsPerChapter: 1000,
            completion: {
              editedChapters: {
                "1": {
                  sourceRunId: completedScopedRunId,
                  contentDigest: "sha256:edited",
                  changed: true,
                },
              },
            },
          })}::jsonb,
          now() - interval '1 minute'
        )
    `;

    const access = { fullBookUnlocked: true, balanceCredits: 100 };
    const library = await listAuthoringJourneySnapshots(userId, access);
    const openProject = await getAuthoringJourneySnapshot({
      userId,
      projectId,
      access,
    });
    const libraryProject = library.find((snapshot) => snapshot.project.id === projectId);

    expect(libraryProject?.run).toMatchObject({
      id: completedScopedRunId,
      kind: "edit_pass",
      effectiveStatus: "completed",
    });
    expect(openProject?.run).toMatchObject({
      id: completedScopedRunId,
      kind: "edit_pass",
      effectiveStatus: "completed",
    });
    expect(libraryProject?.nextAction).toEqual(openProject?.nextAction);
    expect(openProject?.nextAction).toMatchObject({
      kind: "edit_manuscript",
      href: `/projects/${projectId}/editor`,
    });
  });

  it("keeps a completed pinned-v1 manuscript complete in both journey projections", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const runId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience, status,
        target_chapters, target_words_per_chapter, settings, completed_at
      )
      values (
        ${projectId}, ${userId}, 'Pinned completion fixture',
        'A historical completed book must remain readable.', 'mystery',
        'full_book', 'editing', 1, 1000, '{"qualityTier":"standard"}'::jsonb, now()
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Pinned completion fixture')
    `;
    await observer!`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (
        ${randomUUID()}, ${bookId}, 1, 'Complete',
        'Historical final prose remains available.', 5, 'final'
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct, completed_at
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book',
        'completed', '{"protocolVersion":1,"targetChapters":1}'::jsonb,
        'done', 100, now()
      )
    `;

    const access = { fullBookUnlocked: true, balanceCredits: 100 };
    const library = await listAuthoringJourneySnapshots(userId, access);
    const openProject = await getAuthoringJourneySnapshot({
      userId,
      projectId,
      access,
    });
    const libraryProject = library.find((snapshot) => snapshot.project.id === projectId);

    expect(libraryProject?.run).toMatchObject({
      id: runId,
      effectiveStatus: "completed",
      completionArtifactsReady: true,
    });
    expect(openProject?.run).toMatchObject({
      id: runId,
      effectiveStatus: "completed",
      completionArtifactsReady: true,
    });
    expect(libraryProject?.nextAction).toEqual(openProject?.nextAction);
    expect(openProject?.nextAction).toMatchObject({
      kind: "read_or_export",
      href: `/projects/${projectId}/manuscript`,
    });
  });

  it("rolls back a multi-table generated-output commit when its tail fails", async () => {
    await expect(
      withActiveAuthoringMutation(
        { dbRunId: pauseRunId, projectId: pauseProjectId, userId },
        async (tx) => {
          await tx
            .update(schema.chapters)
            .set({ summary: "Must roll back" })
            .where(eq(schema.chapters.id, pauseChapterId));
          await tx.insert(schema.entities).values({
            bookId: pauseBookId,
            kind: "location",
            name: "Rollback Hall",
            aliases: [],
            attrs: {},
          });
          throw new Error("simulated transaction-tail failure");
        },
      ),
    ).rejects.toThrow("simulated transaction-tail failure");

    const [chapter] = (await observer!`
      select summary
      from chapters
      where id = ${pauseChapterId}
    `) as unknown as Array<{ summary: string | null }>;
    const entities = await observer!`
      select id
      from entities
      where book_id = ${pauseBookId} and name = 'Rollback Hall'
    `;
    expect(chapter?.summary).toBeNull();
    expect(entities).toHaveLength(0);
  });

  it("persists a cancellation request without terminalizing and blocks later output commits", async () => {
    let releaseMutation!: () => void;
    let mutationHasLock!: () => void;
    const mutationLocked = new Promise<void>((resolve) => {
      mutationHasLock = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });
    const mutation = withActiveAuthoringMutation(
      { dbRunId: pauseRunId, projectId: pauseProjectId, userId },
      async (tx) => {
        mutationHasLock();
        await release;
        await tx
          .update(schema.chapters)
          .set({ summary: "Committed before cancellation" })
          .where(eq(schema.chapters.id, pauseChapterId));
      },
    );
    await mutationLocked;
    const cancellation = requestAuthoringRunCancellation({
      runId: pauseRunId,
      projectId: pauseProjectId,
      userId,
      reason: "Integration test stop",
    });
    // The mutation already owns the shared project lock. Give the cancellation
    // request a turn to block on it, then let the mutation commit first.
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseMutation();
    const [, request] = await Promise.all([mutation, cancellation]);
    expect(request).toMatchObject({
      runId: pauseRunId,
      status: "awaiting_input",
      requested: true,
    });

    const [run] = (await observer!`
      select status, cancellation_requested_at as "requestedAt", stage_description as "detail"
      from generation_runs
      where id = ${pauseRunId}
    `) as unknown as Array<{
      status: string;
      requestedAt: string | null;
      detail: string | null;
    }>;
    expect(run).toMatchObject({
      status: "awaiting_input",
      detail: "Stopping safely",
    });
    expect(run?.requestedAt).not.toBeNull();
    await expect(throwIfAuthoringCancellationRequested(pauseRunId)).rejects.toBeInstanceOf(
      AuthoringCancellationRequestedError,
    );
    await expect(
      withActiveAuthoringMutation(
        { dbRunId: pauseRunId, projectId: pauseProjectId, userId },
        (tx) =>
          tx
            .update(schema.chapters)
            .set({ summary: "Must not commit after cancellation" })
            .where(eq(schema.chapters.id, pauseChapterId)),
      ),
    ).rejects.toThrow("Authoring cancellation requested");
    await expect(
      acceptAuthoringRunInput({
        runId: pauseRunId,
        userId,
        kind: "outline_approval",
        pauseVersion: 1,
        requestKey: randomUUID(),
        payload: { decision: "approved-after-cancellation" },
      }),
    ).rejects.toThrow("Run is not waiting for this input");
    const [chapter] = (await observer!`
      select summary
      from chapters
      where id = ${pauseChapterId}
    `) as unknown as Array<{ summary: string | null }>;
    expect(chapter?.summary).toBe("Committed before cancellation");
  });

  it("terminalizes a scoped completion as cancelled when stop wins after output commit", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const chapterId = randomUUID();
    const runId = randomUUID();
    const nextRequestKey = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Scoped cancellation fixture',
        'A chapter whose durable output committed just before stop.', 'mystery',
        'full_book', 1, 1000, '{}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Scoped cancellation fixture')
    `;
    await observer!`
      insert into chapters (
        id, book_id, chapter_number, title, summary, content, word_count, status
      )
      values (
        ${chapterId}, ${bookId}, 1, 'Opening', 'The committed summary.',
        'The committed chapter output remains saved.', 6, 'drafted'
      )
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()}, 'chapter', 'running',
        ${JSON.stringify({
          protocolVersion: 2,
          tier: "standard",
          targetChapters: 1,
          targetWordsPerChapter: 1000,
          completion: {
            chapterSummaries: {
              "1": {
                sourceRunId: runId,
                contentDigest: "sha256:committed-output",
              },
            },
          },
        })}::jsonb,
        'chapters', 99
      )
    `;

    await expect(
      requestAuthoringRunCancellation({
        runId,
        projectId,
        userId,
        reason: "Stop after the saved output boundary",
      }),
    ).resolves.toMatchObject({ requested: true, status: "running" });

    await expect(
      transitionAuthoringRunState({
        runId,
        projectId,
        userId,
        status: "completed",
        resolveCancellationOnComplete: true,
      }),
    ).resolves.toEqual({ status: "cancelled", transitioned: true });

    const [terminal] = (await observer!`
      select
        status,
        current_stage as "stage",
        completed_at as "completedAt",
        config #>> '{completion,chapterSummaries,1,sourceRunId}' as "checkpointRunId"
      from generation_runs
      where id = ${runId}
    `) as unknown as Array<{
      status: string;
      stage: string;
      completedAt: string | null;
      checkpointRunId: string | null;
    }>;
    expect(terminal).toMatchObject({
      status: "cancelled",
      stage: "cancelled",
      checkpointRunId: runId,
    });
    expect(terminal?.completedAt).not.toBeNull();

    const next = await insertQueuedAuthoringRun({
      projectId,
      userId,
      kind: "chapter",
      config: {
        protocolVersion: 2,
        tier: "standard",
        targetChapters: 1,
        targetWordsPerChapter: 1000,
      },
      requestKey: nextRequestKey,
    });
    expect(next).toMatchObject({ inserted: true, status: "queued", kind: "chapter" });
    await expect(
      transitionAuthoringRunState({
        runId: next.id,
        projectId,
        userId,
        status: "cancelled",
        error: "Fixture cleanup",
      }),
    ).resolves.toMatchObject({ status: "cancelled", transitioned: true });
  });

  it("permits the third same-run dispatch claim and rejects every later attempt", async () => {
    await expect(
      claimUncertainAuthoringRun({
        runId: dispatchRunId,
        projectId: dispatchProjectId,
        userId,
      }),
    ).resolves.toMatchObject({
      id: dispatchRunId,
      projectId: dispatchProjectId,
      userId,
    });
    const [afterThird] = (await observer!`
      select dispatch_attempts as "attempts"
      from generation_runs
      where id = ${dispatchRunId}
    `) as unknown as Array<{ attempts: number }>;
    expect(afterThird?.attempts).toBe(3);

    await observer!`
      update generation_runs
      set acceptance_dispatch_claimed_at = now() - interval '5 minutes'
      where id = ${dispatchRunId}
    `;
    await expect(
      claimUncertainAuthoringRun({
        runId: dispatchRunId,
        projectId: dispatchProjectId,
        userId,
      }),
    ).resolves.toBeNull();
    const [afterRejected] = (await observer!`
      select dispatch_attempts as "attempts"
      from generation_runs
      where id = ${dispatchRunId}
    `) as unknown as Array<{ attempts: number }>;
    expect(afterRejected?.attempts).toBe(3);
  });
});
