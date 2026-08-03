import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthoringToolMutationReplayConflictError,
  withAuthoringToolMutation,
} from "@/ai/tools/authoring-mutation";
import { schema } from "@/db";
import { requestAuthoringRunCancellation } from "@/lib/generation-runs";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;
  if (isolated !== "1" || !value) {
    throw new Error("Authoring tool tests require E2E_DATABASE_ISOLATED=1 and E2E_DATABASE_URL.");
  }
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.E2E_DATABASE_HOST ||
    parsed.hostname !== process.env.E2E_DATABASE_HOST
  ) {
    throw new Error("Authoring tool tests require the explicitly allowed disposable Neon host.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("authoring tool mutations against isolated Neon", () => {
  const userId = `e2e-authoring-tools-${randomUUID()}`;
  const projectId = randomUUID();
  const bookId = randomUUID();
  const runId = randomUUID();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Tool mutation fixture',
        'A disposable authoring-tool fixture.', 'full_book',
        1, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Tool mutation fixture')
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()},
        'full_book', 'running',
        '{"protocolVersion":2,"tier":"standard","targetChapters":1,"targetWordsPerChapter":1000}'::jsonb,
        'chapters', 50
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("commits one semantic tool mutation and refuses another after Stop", async () => {
    const ctx = {
      runId,
      userId,
      projectId,
      bookId,
      chapterNumber: 1,
      mutationScope: "continuity:plot:fixture",
    };
    const apply = (
      description = "The map appears twice.",
      toolCallId = "call-continuity-initial",
    ) =>
      withAuthoringToolMutation({
        ctx,
        toolName: "continuityRecordIssue",
        toolCallId,
        logicalOrdinal: 1,
        payload: {
          chapters: [1],
          category: "plot",
          severity: "major",
          description,
        },
        mutate: async (tx) => {
          await tx.insert(schema.continuityIssues).values({
            bookId,
            runId,
            chapters: [1],
            category: "plot",
            severity: "major",
            description: "The map appears twice.",
          });
          return "inserted" as const;
        },
        replay: () => "replayed" as const,
      });

    await expect(apply()).resolves.toBe("inserted");
    await expect(apply("The map appears twice.", "call-continuity-compensated-redo")).resolves.toBe(
      "replayed",
    );
    await expect(
      apply("The map is described twice.", "call-continuity-changed-redo"),
    ).rejects.toBeInstanceOf(AuthoringToolMutationReplayConflictError);

    let prerequisiteReady = false;
    let attempts = 0;
    const retryAfterPrerequisite = () =>
      withAuthoringToolMutation({
        ctx,
        toolName: "entityRelate",
        toolCallId: "call-relation-1",
        logicalOrdinal: 2,
        payload: { from: "Mara", to: "Map", type: "owns" },
        mutate: async () => {
          attempts += 1;
          return { recorded: prerequisiteReady };
        },
        replay: () => ({ recorded: true }),
        shouldRecord: (result) => result.recorded,
      });
    await expect(retryAfterPrerequisite()).resolves.toEqual({ recorded: false });
    prerequisiteReady = true;
    await expect(retryAfterPrerequisite()).resolves.toEqual({ recorded: true });
    await expect(retryAfterPrerequisite()).resolves.toEqual({ recorded: true });
    expect(attempts).toBe(2);

    const [facts] = (await observer!`
      select
        (select count(*)::int from continuity_issues where run_id = ${runId}) as issues,
        (
          select count(*)::int
          from generation_events
          where run_id = ${runId} and type = 'tool_mutation'
        ) as markers
    `) as unknown as Array<{ issues: number; markers: number }>;
    expect(facts).toEqual({ issues: 1, markers: 2 });

    await requestAuthoringRunCancellation({
      runId,
      projectId,
      userId,
      reason: "Integration test safe stop",
    });
    await expect(
      withAuthoringToolMutation({
        ctx,
        toolName: "entityRelate",
        payload: { from: "Mara", to: "Map", type: "owns" },
        mutate: async () => "must-not-run",
        replay: () => "must-not-replay",
      }),
    ).rejects.toThrow("Authoring cancellation requested");
  });
});
