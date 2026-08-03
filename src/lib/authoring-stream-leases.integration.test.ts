import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  acquireAuthoringStreamLease,
  MAX_AUTHORING_STREAMS_PER_RUN,
  MAX_AUTHORING_STREAMS_PER_USER,
  releaseAuthoringStreamLease,
} from "@/lib/authoring-stream-leases";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;
  if (isolated !== "1" || !value) {
    throw new Error("Stream lease tests require E2E_DATABASE_ISOLATED=1 and E2E_DATABASE_URL.");
  }
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.E2E_DATABASE_HOST ||
    parsed.hostname !== process.env.E2E_DATABASE_HOST
  ) {
    throw new Error("Stream lease tests require the explicitly allowed disposable Neon host.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("authoring stream leases against isolated Neon", () => {
  const userId = `e2e-authoring-stream-${randomUUID()}`;
  const projectId = randomUUID();
  const runId = randomUUID();
  const secondRunId = randomUUID();
  const thirdRunId = randomUUID();
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
        ${projectId}, ${userId}, 'Stream lease fixture',
        'A disposable stream fixture.', 'full_book',
        3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()},
        'full_book', 'running',
        '{"protocolVersion":2,"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
        'chapters', 50
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config,
        current_stage, progress_pct, completed_at
      )
      values
        (
          ${secondRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'full_book', 'completed',
          '{"protocolVersion":2,"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          'done', 100, now()
        ),
        (
          ${thirdRunId}, ${projectId}, ${userId}, ${randomUUID()},
          'full_book', 'completed',
          '{"protocolVersion":2,"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
          'done', 100, now()
        )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("caps concurrent readers, releases promptly, and reclaims expired leases", async () => {
    const ids = await Promise.all(
      Array.from({ length: MAX_AUTHORING_STREAMS_PER_RUN }, (_, index) =>
        acquireAuthoringStreamLease({
          runId,
          userId,
          namespace: index === 0 ? "progress" : `chapter:${(index % 3) + 1}`,
        }),
      ),
    );
    expect(ids.every(Boolean)).toBe(true);
    await expect(
      acquireAuthoringStreamLease({ runId, userId, namespace: "progress" }),
    ).resolves.toBeNull();

    await releaseAuthoringStreamLease({ id: ids[0]!, runId, userId });
    await expect(
      acquireAuthoringStreamLease({ runId, userId, namespace: "progress" }),
    ).resolves.toEqual(expect.any(String));

    await observer!`
      update authoring_stream_leases
      set created_at = now() - interval '2 minutes',
          expires_at = now() - interval '1 minute'
      where run_id = ${runId}
    `;
    await expect(
      acquireAuthoringStreamLease({ runId, userId, namespace: "progress" }),
    ).resolves.toEqual(expect.any(String));
    const [active] = (await observer!`
      select count(*)::int as count
      from authoring_stream_leases
      where run_id = ${runId}
    `) as unknown as Array<{ count: number }>;
    expect(active?.count).toBe(1);

    await observer!`delete from authoring_stream_leases where user_id = ${userId}`;
    const perRunBatches = [
      ...Array.from({ length: MAX_AUTHORING_STREAMS_PER_RUN }, () => runId),
      ...Array.from({ length: MAX_AUTHORING_STREAMS_PER_RUN }, () => secondRunId),
    ];
    expect(perRunBatches).toHaveLength(MAX_AUTHORING_STREAMS_PER_USER);
    const aggregateIds = [];
    for (const targetRunId of perRunBatches) {
      aggregateIds.push(
        await acquireAuthoringStreamLease({
          runId: targetRunId,
          userId,
          namespace: "progress",
        }),
      );
    }
    expect(aggregateIds.every(Boolean)).toBe(true);
    await expect(
      acquireAuthoringStreamLease({
        runId: thirdRunId,
        userId,
        namespace: "progress",
      }),
    ).resolves.toBeNull();

    await releaseAuthoringStreamLease({
      id: aggregateIds[0]!,
      runId,
      userId,
    });
    await expect(
      acquireAuthoringStreamLease({
        runId: thirdRunId,
        userId,
        namespace: "progress",
      }),
    ).resolves.toEqual(expect.any(String));
  });
});
