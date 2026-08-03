import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const workflowStreamWriteMock = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error("injected stream publication fault")),
);
const workflowReleaseLockMock = vi.hoisted(() => vi.fn());
const emailSendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: "email-1" } }));

vi.mock("workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("workflow")>();
  return {
    ...actual,
    getStepMetadata: () => ({ stepId: "fault-matrix-finalization" }),
    getWritable: () => ({
      getWriter: () => ({
        write: workflowStreamWriteMock,
        releaseLock: workflowReleaseLockMock,
      }),
    }),
  };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: emailSendMock };
  },
}));

import type { BookConcept, BookOutline } from "@/ai/schemas";
import { persistConcept } from "@/ai/agents/concept";
import { persistEntityBible, type GeneratedEntityBible } from "@/ai/agents/entity-bible";
import { persistOutline } from "@/ai/agents/outline";
import { persistContinuityIssues } from "@/ai/agents/continuity";
import { getDb, schema, withDbTransaction } from "@/db";
import {
  acceptAuthoringRunInput,
  allocateAuthoringPause,
  clearAuthoringPause,
  consumeAuthoringRunInput,
  markAuthoringPauseRegistered,
} from "@/lib/authoring-inputs";
import { debitCredits, grantCredits, reserveCredits } from "@/lib/billing/credits";
import {
  claimUncertainAuthoringRun,
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  ProjectStartSnapshotChangedError,
  requestAuthoringRunCancellation,
  terminalizeAuthoringRun,
  transitionAuthoringRunState,
} from "@/lib/generation-runs";
import { persistRunEvent } from "@/lib/run-event-store";
import { updateProjectTransaction } from "@/lib/project-transaction-operations";
import type { GenerationConfig } from "@/lib/run-events";
import { finalizeStep, withActiveAuthoringMutation } from "@/workflows/steps";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;
  if (isolated !== "1") {
    throw new Error("Refusing fault-matrix tests without E2E_DATABASE_ISOLATED=1.");
  }
  if (!value) throw new Error("E2E_DATABASE_URL must identify the disposable database branch.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing fault-matrix tests in NODE_ENV=production.");
  }

  const parsed = new URL(value);
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !allowedHost ||
    parsed.hostname !== allowedHost
  ) {
    throw new Error(
      "E2E_DATABASE_HOST must exactly match the disposable database branch hostname.",
    );
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

type Fixture = {
  projectId: string;
  bookId: string;
  runId: string;
  ref: { dbRunId: string; projectId: string; userId: string };
};

const concept: BookConcept = {
  title: "Fault Matrix Story",
  logline: "A cartographer repairs a city whose roads forget their destinations.",
  synopsis: "Mara follows a shifting map through a city that is losing its memory.",
  themes: ["memory", "craft"],
  setting: "A coastal city built around an old observatory",
  centralConflict: "Mara must restore the map before the harbor disappears.",
  uniqueElements: ["A map that redraws itself"],
  characters: [
    {
      name: "Mara Vale",
      role: "Protagonist",
      description: "A patient cartographer who verifies every route.",
      arc: "She learns to trust her own revisions.",
    },
  ],
  moderation: { flagged: false },
};

const outline: BookOutline = {
  title: concept.title,
  logline: concept.logline,
  synopsis: concept.synopsis,
  themes: concept.themes,
  plotStructure: "three-act",
  chapters: Array.from({ length: 3 }, (_, index) => ({
    number: index + 1,
    title: `Boundary ${index + 1}`,
    summary: `Mara crosses reliability boundary ${index + 1}.`,
    keyEvents: [`Boundary ${index + 1} is crossed`],
    charactersPresent: ["Mara Vale"],
    emotionalArc:
      index === 0
        ? ("exposition" as const)
        : index === 2
          ? ("resolution" as const)
          : ("climax" as const),
    openingHook: "The map changes.",
    closingHook: "The next route appears.",
    targetWords: 1_000,
  })),
};

const bible: GeneratedEntityBible = {
  entities: [
    {
      kind: "character",
      name: "Mara Vale",
      aliases: [],
      attrs: {
        role: "Protagonist",
        background: "Raised among harbor surveyors.",
        appearance: "A compact figure with wind-reddened cheeks.",
        facts: ["Mara is a cartographer."],
      },
    },
    {
      kind: "location",
      name: "North Observatory",
      aliases: [],
      attrs: {
        locationType: "observatory",
        description: "A copper-domed tower above the harbor.",
        facts: ["The observatory overlooks the harbor."],
      },
    },
  ],
  relationships: [
    {
      from: "Mara Vale",
      to: "North Observatory",
      type: "located-in",
      description: "Mara uses the observatory as her survey room.",
    },
  ],
};

const continuityIssues = [
  {
    chapters: [1, 2],
    category: "setting" as const,
    severity: "major" as const,
    description: "The observatory door changes material between chapters.",
    suggestedFix: "Keep the door copper in both chapters.",
  },
];

const inputSnapshot: GenerationConfig["inputSnapshot"] = {
  workingTitle: "Fault Matrix Story",
  brief: "A cartographer repairs a city whose roads forget their destinations.",
  genre: "mystery",
  styleGuide: null,
  voiceProfile: null,
  pov: "third_limited",
  tense: "past",
  tone: "hopeful",
  styleProfile: null,
  heatLevel: "none",
  violenceLevel: "mild",
  profanity: "none",
  avoidTopics: [],
};

describeIsolated.sequential("authoring fault matrix against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-authoring-fault-matrix-${suffix}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousResendApiKey = process.env.RESEND_API_KEY;
  let observer: ReturnType<typeof neon> | null = null;

  async function createFixture(
    label: string,
    options: { status?: "queued" | "running"; dispatchReady?: boolean } = {},
  ): Promise<Fixture> {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const runId = randomUUID();
    const status = options.status ?? "running";
    const config: GenerationConfig = {
      protocolVersion: 2,
      tier: "standard",
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
      waveSize: 1,
      requireOutlineApproval: true,
      inputSnapshot,
      ...(options.dispatchReady ? { dispatchReady: true } : {}),
    };
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, ${`Fault matrix ${label}`},
        'A disposable authoring fault fixture.', 'mystery', 'full_book',
        3, 1000, '{"qualityTier":"standard","requireOutlineApproval":true}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, ${`Fault matrix ${label}`})
    `;
    await observer!`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct, acceptance_uncertain_at,
        acceptance_dispatch_claimed_at, dispatch_attempts
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()}, 'full_book', ${status},
        ${JSON.stringify(config)}::jsonb,
        ${status === "queued" ? "queued" : "concept"},
        ${status === "queued" ? 0 : 2},
        ${options.dispatchReady ? new Date(Date.now() - 5 * 60_000) : null},
        null,
        ${options.dispatchReady ? 1 : 0}
      )
    `;
    return {
      projectId,
      bookId,
      runId,
      ref: { dbRunId: runId, projectId, userId },
    };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Isolated database URL disappeared before setup.");
    process.env.DATABASE_URL = databaseUrl;
    process.env.RESEND_API_KEY = "fault-matrix-key";
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await grantCredits({
      userId,
      credits: 1_000,
      description: "Fault matrix wallet",
      externalRef: `fault-matrix-grant:${suffix}`,
      kind: "grant",
    });
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousResendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendApiKey;
  });

  it("rolls back and replays concept, outline, Bible, chapter, edit, and continuity boundaries", async () => {
    const fixture = await createFixture("persistence");

    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await persistConcept(fixture.bookId, concept, tx);
        throw new Error("fault after concept persistence");
      }),
    ).rejects.toThrow("fault after concept persistence");
    const [book] = await getDb()
      .select({ concept: schema.books.concept })
      .from(schema.books)
      .where(eq(schema.books.id, fixture.bookId));
    expect(book?.concept).toEqual({});

    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistConcept(fixture.bookId, concept, tx),
    );
    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistConcept(fixture.bookId, concept, tx),
    );
    let entityRows = await getDb()
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(eq(schema.entities.bookId, fixture.bookId));
    expect(entityRows).toHaveLength(1);

    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await persistOutline(fixture.bookId, outline, tx);
        throw new Error("fault after outline and planned chapters");
      }),
    ).rejects.toThrow("fault after outline and planned chapters");
    expect(
      await getDb()
        .select()
        .from(schema.outlines)
        .where(eq(schema.outlines.bookId, fixture.bookId)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, fixture.bookId)),
    ).toHaveLength(0);

    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistOutline(fixture.bookId, outline, tx),
    );
    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistOutline(fixture.bookId, outline, tx),
    );
    let chapters = await getDb()
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, fixture.bookId));
    expect(chapters).toHaveLength(3);

    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await persistEntityBible(fixture.bookId, bible, tx);
        throw new Error("fault after story Bible persistence");
      }),
    ).rejects.toThrow("fault after story Bible persistence");
    entityRows = await getDb()
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(eq(schema.entities.bookId, fixture.bookId));
    expect(entityRows).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(schema.entityRelationships)
        .where(eq(schema.entityRelationships.bookId, fixture.bookId)),
    ).toHaveLength(0);

    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistEntityBible(fixture.bookId, bible, tx),
    );
    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistEntityBible(fixture.bookId, bible, tx),
    );
    entityRows = await getDb()
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(eq(schema.entities.bookId, fixture.bookId));
    expect(entityRows).toHaveLength(2);
    expect(
      await getDb()
        .select()
        .from(schema.entityRelationships)
        .where(eq(schema.entityRelationships.bookId, fixture.bookId)),
    ).toHaveLength(1);

    const firstChapter = chapters.find((chapter) => chapter.chapterNumber === 1);
    if (!firstChapter) throw new Error("Chapter fixture missing");
    const revisionId = randomUUID();
    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await tx
          .update(schema.chapters)
          .set({ content: "A rolled-back draft.", wordCount: 3, status: "drafted" })
          .where(eq(schema.chapters.id, firstChapter.id));
        await tx.insert(schema.chapterRevisions).values({
          id: revisionId,
          chapterId: firstChapter.id,
          content: "A rolled-back draft.",
          source: "ai-draft",
          runId: fixture.runId,
        });
        throw new Error("fault after chapter commit");
      }),
    ).rejects.toThrow("fault after chapter commit");
    [chapters] = [
      await getDb()
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, fixture.bookId)),
    ];
    expect(chapters.find((chapter) => chapter.id === firstChapter.id)?.content).toBe("");
    expect(
      await getDb()
        .select()
        .from(schema.chapterRevisions)
        .where(eq(schema.chapterRevisions.id, revisionId)),
    ).toHaveLength(0);

    await withActiveAuthoringMutation(fixture.ref, async (tx) => {
      await tx
        .update(schema.chapters)
        .set({ content: "A durable draft.", wordCount: 3, status: "drafted" })
        .where(eq(schema.chapters.id, firstChapter.id));
      await tx.insert(schema.chapterRevisions).values({
        id: revisionId,
        chapterId: firstChapter.id,
        content: "A durable draft.",
        source: "ai-draft",
        runId: fixture.runId,
      });
    });

    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await tx
          .update(schema.chapters)
          .set({ content: "An edit that must roll back.", status: "edited" })
          .where(eq(schema.chapters.id, firstChapter.id));
        throw new Error("fault after edit commit");
      }),
    ).rejects.toThrow("fault after edit commit");
    const [afterEditFault] = await getDb()
      .select({ content: schema.chapters.content, status: schema.chapters.status })
      .from(schema.chapters)
      .where(eq(schema.chapters.id, firstChapter.id));
    expect(afterEditFault).toMatchObject({ content: "A durable draft.", status: "drafted" });

    await expect(
      withActiveAuthoringMutation(fixture.ref, async (tx) => {
        await persistContinuityIssues(fixture.bookId, fixture.runId, continuityIssues, tx);
        throw new Error("fault after continuity persistence");
      }),
    ).rejects.toThrow("fault after continuity persistence");
    expect(
      await getDb()
        .select()
        .from(schema.continuityIssues)
        .where(eq(schema.continuityIssues.runId, fixture.runId)),
    ).toHaveLength(0);

    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistContinuityIssues(fixture.bookId, fixture.runId, continuityIssues, tx),
    );
    await withActiveAuthoringMutation(fixture.ref, (tx) =>
      persistContinuityIssues(fixture.bookId, fixture.runId, continuityIssues, tx),
    );
    expect(
      await getDb()
        .select()
        .from(schema.continuityIssues)
        .where(eq(schema.continuityIssues.runId, fixture.runId)),
    ).toHaveLength(1);
  });

  it("deduplicates durable input, stream events, provider debits, and concurrent starts", async () => {
    const fixture = await createFixture("idempotency");
    const pause = await allocateAuthoringPause({
      runId: fixture.runId,
      projectId: fixture.projectId,
      userId,
      kind: "outline_approval",
      pauseKey: "fault-matrix-outline",
    });
    await markAuthoringPauseRegistered({
      runId: fixture.runId,
      projectId: fixture.projectId,
      userId,
      kind: "outline_approval",
      pauseVersion: pause.version,
    });

    const [firstInput, replayedInput] = await Promise.all([
      acceptAuthoringRunInput({
        runId: fixture.runId,
        userId,
        kind: "outline_approval",
        pauseVersion: pause.version,
        requestKey: randomUUID(),
        payload: { approved: true },
      }),
      acceptAuthoringRunInput({
        runId: fixture.runId,
        userId,
        kind: "outline_approval",
        pauseVersion: pause.version,
        requestKey: randomUUID(),
        payload: { approved: true },
      }),
    ]);
    expect(firstInput.input.id).toBe(replayedInput.input.id);
    expect([firstInput.replayed, replayedInput.replayed].sort()).toEqual([false, true]);
    await expect(
      consumeAuthoringRunInput({
        runId: fixture.runId,
        kind: "outline_approval",
        pauseVersion: pause.version,
        inputId: firstInput.input.id,
      }),
    ).resolves.toMatchObject({ approved: true });
    await expect(
      consumeAuthoringRunInput({
        runId: fixture.runId,
        kind: "outline_approval",
        pauseVersion: pause.version,
        inputId: firstInput.input.id,
      }),
    ).resolves.toMatchObject({ approved: true });
    await clearAuthoringPause({
      runId: fixture.runId,
      kind: "outline_approval",
      pauseVersion: pause.version,
    });

    const eventKey = "fault-matrix:provider-stream";
    const eventWrites = await Promise.all([
      persistRunEvent({
        runId: fixture.runId,
        eventKey,
        event: { type: "stage", stage: "chapters", pct: 25, detail: "First wave" },
      }),
      persistRunEvent({
        runId: fixture.runId,
        eventKey,
        event: { type: "stage", stage: "chapters", pct: 25, detail: "First wave" },
      }),
    ]);
    expect(eventWrites.filter((result) => result.inserted)).toHaveLength(1);

    const debitRef = `fault-matrix-provider-debit:${fixture.runId}`;
    const debits = await Promise.all([
      debitCredits({
        userId,
        meteredUsd: 0.01,
        description: "Fault matrix provider call",
        projectId: fixture.projectId,
        runId: fixture.runId,
        externalRef: debitRef,
      }),
      debitCredits({
        userId,
        meteredUsd: 0.01,
        description: "Fault matrix provider call",
        projectId: fixture.projectId,
        runId: fixture.runId,
        externalRef: debitRef,
      }),
    ]);
    expect(debits.sort()).toEqual([false, true]);

    const startProjectId = randomUUID();
    const startBookId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${startProjectId}, ${userId}, 'Concurrent start fixture',
        'Two browser tabs submit the same durable key.', 'fantasy', 'full_book',
        3, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${startBookId}, ${startProjectId}, 'Concurrent start fixture')
    `;
    const requestKey = randomUUID();
    const startConfig = {
      protocolVersion: 2,
      tier: "standard",
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
      waveSize: 1,
      requireOutlineApproval: true,
      inputSnapshot,
    } satisfies GenerationConfig;
    const starts = await Promise.all([
      insertQueuedAuthoringRun({
        projectId: startProjectId,
        userId,
        kind: "full_book",
        config: startConfig,
        requestKey,
      }),
      insertQueuedAuthoringRun({
        projectId: startProjectId,
        userId,
        kind: "full_book",
        config: startConfig,
        requestKey,
      }),
    ]);
    expect(new Set(starts.map((run) => run.id)).size).toBe(1);
    expect(starts.filter((run) => run.inserted)).toHaveLength(1);
    const runRows = await observer!`
      select id
      from generation_runs
      where project_id = ${startProjectId} and request_key = ${requestKey}
    `;
    expect(runRows).toHaveLength(1);

    const workflowRunIds = [`workflow-a-${randomUUID()}`, `workflow-b-${randomUUID()}`];
    const workflowLinks = await Promise.all(
      workflowRunIds.map((workflowRunId) =>
        linkAuthoringRunWorkflow({
          runId: starts[0].id,
          projectId: startProjectId,
          userId,
          workflowRunId,
        }),
      ),
    );
    expect(workflowLinks.filter(Boolean)).toHaveLength(1);
    const [linkedRun] = (await observer!`
      select workflow_run_id as "workflowRunId"
      from generation_runs
      where id = ${starts[0].id}
    `) as unknown as Array<{ workflowRunId: string | null }>;
    expect(workflowRunIds).toContain(linkedRun?.workflowRunId);
  });

  it("serializes retry, cancellation, settings, and watchdog claims", async () => {
    const retryFixture = await createFixture("retry-cancel", {
      status: "queued",
      dispatchReady: true,
    });
    const [claim, cancellation] = await Promise.all([
      claimUncertainAuthoringRun({
        runId: retryFixture.runId,
        projectId: retryFixture.projectId,
        userId,
      }),
      requestAuthoringRunCancellation({
        runId: retryFixture.runId,
        projectId: retryFixture.projectId,
        userId,
        reason: "Fault matrix concurrent stop",
      }),
    ]);
    expect(cancellation?.requested).toBe(true);
    const [retryState] = (await observer!`
      select dispatch_attempts as "dispatchAttempts",
             cancellation_requested_at as "cancellationRequestedAt"
      from generation_runs
      where id = ${retryFixture.runId}
    `) as unknown as Array<{
      dispatchAttempts: number;
      cancellationRequestedAt: string | null;
    }>;
    expect(retryState?.cancellationRequestedAt).not.toBeNull();
    expect(retryState?.dispatchAttempts).toBe(claim ? 2 : 1);
    await expect(
      reserveCredits({
        userId,
        credits: 1,
        externalRef: `generation-reservation:${retryFixture.runId}:after-cancel`,
        description: "Must not authorize after cancellation",
        projectId: retryFixture.projectId,
        runId: retryFixture.runId,
      }),
    ).resolves.toMatchObject({ status: "insufficient" });
    await observer!`
      update generation_runs
      set acceptance_dispatch_claimed_at = now() - interval '5 minutes'
      where id = ${retryFixture.runId}
    `;
    await expect(
      claimUncertainAuthoringRun({
        runId: retryFixture.runId,
        projectId: retryFixture.projectId,
        userId,
      }),
    ).resolves.toBeNull();

    const selfLinkFixture = await createFixture("self-link-cancel", {
      status: "queued",
      dispatchReady: true,
    });
    await expect(
      requestAuthoringRunCancellation({
        runId: selfLinkFixture.runId,
        projectId: selfLinkFixture.projectId,
        userId,
        reason: "Stop before Workflow self-link",
      }),
    ).resolves.toMatchObject({ requested: true, status: "queued" });
    await expect(
      linkAuthoringRunWorkflow({
        runId: selfLinkFixture.runId,
        projectId: selfLinkFixture.projectId,
        userId,
        workflowRunId: `workflow-self-link-${suffix}`,
      }),
    ).resolves.toBe(true);
    await expect(
      transitionAuthoringRunState({
        runId: selfLinkFixture.runId,
        projectId: selfLinkFixture.projectId,
        userId,
        status: "running",
      }),
    ).resolves.toEqual({ status: "cancelled", transitioned: true });

    const watchdogFixture = await createFixture("watchdog", {
      status: "queued",
      dispatchReady: true,
    });
    const claims = await Promise.all(
      Array.from({ length: 3 }, () =>
        claimUncertainAuthoringRun({
          runId: watchdogFixture.runId,
          projectId: watchdogFixture.projectId,
          userId,
        }),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);

    const settingsProjectId = randomUUID();
    const settingsBookId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${settingsProjectId}, ${userId}, 'Settings before start',
        'The author changes a title while another tab starts.', 'fantasy', 'full_book',
        3, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${settingsBookId}, ${settingsProjectId}, 'Settings before start')
    `;
    const settingsRequestKey = randomUUID();
    const [settingsOutcome, startOutcome] = await Promise.all([
      withDbTransaction((tx) =>
        updateProjectTransaction(tx, {
          projectId: settingsProjectId,
          userId,
          data: { title: "Settings won the race" },
        }),
      ),
      insertQueuedAuthoringRun({
        projectId: settingsProjectId,
        userId,
        kind: "full_book",
        config: {
          protocolVersion: 2,
          tier: "standard",
          targetChapters: 3,
          targetWordsPerChapter: 1_000,
          waveSize: 1,
          requireOutlineApproval: true,
          inputSnapshot,
        } satisfies GenerationConfig,
        requestKey: settingsRequestKey,
      }),
    ]);
    expect(startOutcome.inserted).toBe(true);
    expect(["updated", "active_run"]).toContain(settingsOutcome);
    const [settingsState] = (await observer!`
      select p.title, b.title as "bookTitle", count(r.id)::int as "runCount"
      from projects p
      join books b on b.project_id = p.id
      left join generation_runs r on r.project_id = p.id
      where p.id = ${settingsProjectId}
      group by p.title, b.title
    `) as unknown as Array<{ title: string; bookTitle: string; runCount: number }>;
    expect(settingsState?.runCount).toBe(1);
    if (settingsOutcome === "updated") {
      expect(settingsState).toMatchObject({
        title: "Settings won the race",
        bookTitle: "Settings won the race",
      });
    } else {
      expect(settingsState).toMatchObject({
        title: "Settings before start",
        bookTitle: "Settings before start",
      });
    }
  });

  it("rejects a stale funded start after the saved book shape changes", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    await observer!`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Funding snapshot',
        'The author expands the book in another tab before starting.', 'fantasy',
        'full_book', 3, 1000, '{"qualityTier":"standard"}'::jsonb
      )
    `;
    await observer!`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Funding snapshot')
    `;
    const [before] = (await observer!`
      select
        updated_at as "updatedAt",
        target_chapters as "targetChapters",
        target_words_per_chapter as "targetWordsPerChapter",
        experience
      from projects
      where id = ${projectId}
    `) as unknown as Array<{
      updatedAt: string;
      targetChapters: number;
      targetWordsPerChapter: number;
      experience: "full_book";
    }>;
    if (!before) throw new Error("Funding snapshot fixture was not created");

    await expect(
      withDbTransaction((tx) =>
        updateProjectTransaction(tx, {
          projectId,
          userId,
          data: { targetChapters: 24, targetWordsPerChapter: 2_000 },
        }),
      ),
    ).resolves.toBe("updated");

    await expect(
      insertQueuedAuthoringRun({
        projectId,
        userId,
        kind: "full_book",
        config: {
          protocolVersion: 2,
          tier: "standard",
          targetChapters: 3,
          targetWordsPerChapter: 1_000,
          waveSize: 1,
          requireOutlineApproval: true,
          inputSnapshot,
        } satisfies GenerationConfig,
        requestKey: randomUUID(),
        minimumBalanceCredits: 1,
        expectedProjectSnapshot: {
          ...before,
          updatedAt: new Date(before.updatedAt),
        },
      }),
    ).rejects.toBeInstanceOf(ProjectStartSnapshotChangedError);
    const [runCount] = (await observer!`
      select count(*)::int as count
      from generation_runs
      where project_id = ${projectId}
    `) as unknown as Array<{ count: number }>;
    expect(runCount?.count).toBe(0);
  });

  it("finalizes atomically and cleans a failed reservation exactly once", async () => {
    const completion = await createFixture("completion");
    workflowStreamWriteMock.mockClear();
    workflowReleaseLockMock.mockClear();
    emailSendMock.mockClear();
    const chapterRows = Array.from({ length: 3 }, (_, index) => ({
      id: randomUUID(),
      chapterNumber: index + 1,
      title: `Final chapter ${index + 1}`,
      content: `Chapter ${index + 1} contains durable manuscript text.`,
    }));
    await getDb()
      .insert(schema.chapters)
      .values(
        chapterRows.map((chapter) => ({
          id: chapter.id,
          bookId: completion.bookId,
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          content: chapter.content,
          wordCount: 6,
          status: "edited" as const,
        })),
      );

    await finalizeStep(completion.ref, "Fault matrix complete");
    await finalizeStep(completion.ref, "Fault matrix complete");
    expect(workflowStreamWriteMock).toHaveBeenCalledTimes(2);
    expect(workflowReleaseLockMock).toHaveBeenCalledTimes(2);
    const completionEmailKeys = emailSendMock.mock.calls.map(
      (call) => (call[1] as { idempotencyKey?: string } | undefined)?.idempotencyKey,
    );
    expect(completionEmailKeys).toEqual([`run:${completion.runId}:book-finished`]);
    await expect(
      getDb()
        .select({ status: schema.notificationDeliveries.status })
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.eventKey, `run:${completion.runId}:book-finished`)),
    ).resolves.toEqual([{ status: "sent" }]);
    const [completedRun] = await getDb()
      .select({
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
      })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, completion.runId));
    expect(completedRun?.status).toBe("completed");
    expect(
      (completedRun?.config as GenerationConfig | undefined)?.completion?.finalized,
    ).toMatchObject({ sourceRunId: completion.runId });
    expect(
      await getDb()
        .select()
        .from(schema.generationEvents)
        .where(eq(schema.generationEvents.runId, completion.runId)),
    ).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(schema.creditLedger)
        .where(
          eq(schema.creditLedger.externalRef, `reservation-close-request:${completion.runId}`),
        ),
    ).toHaveLength(1);

    const failed = await createFixture("failure-cleanup");
    const reservationRef = `generation-reservation:${failed.runId}:fault`;
    await expect(
      reserveCredits({
        userId,
        credits: 5,
        externalRef: reservationRef,
        description: "Fault matrix reservation",
        projectId: failed.projectId,
        runId: failed.runId,
      }),
    ).resolves.toMatchObject({ status: "reserved" });
    await terminalizeAuthoringRun({
      runId: failed.runId,
      projectId: failed.projectId,
      userId,
      status: "failed",
      error: "Injected failure cleanup",
      errorCode: "fault_matrix",
      errorStage: "continuity",
      releaseImmediately: true,
    });
    await terminalizeAuthoringRun({
      runId: failed.runId,
      projectId: failed.projectId,
      userId,
      status: "failed",
      error: "A cleanup retry must not replace the root failure",
      errorCode: "cleanup_retry",
      errorStage: "failure_cleanup",
      releaseImmediately: true,
    });
    expect(
      await getDb()
        .select()
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.externalRef, `release:${reservationRef}`)),
    ).toHaveLength(1);
    const [failedRun] = await getDb()
      .select({
        status: schema.generationRuns.status,
        rootErrorCode: schema.generationRuns.rootErrorCode,
        rootErrorStage: schema.generationRuns.rootErrorStage,
      })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, failed.runId));
    expect(failedRun).toMatchObject({
      status: "failed",
      rootErrorCode: "fault_matrix",
      rootErrorStage: "continuity",
    });
  });
});
