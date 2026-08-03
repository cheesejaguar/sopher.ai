import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow sandbox boundaries", () => {
  it("keeps continuity phase selection out of the Node-backed agent module", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/generate-book.ts"), "utf8");
    const runtimeContinuityAgentImport = source
      .split("\n")
      .find(
        (line) =>
          line.includes('from "@/ai/agents/continuity"') &&
          !line.trimStart().startsWith("import type"),
      );

    expect(runtimeContinuityAgentImport).toBeUndefined();
    expect(source).toContain('import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";');
  });

  it("keeps every chapter output mutation behind the cancellation lock", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/steps.ts"), "utf8");
    const section = (start: string, end: string) => {
      const startIndex = source.indexOf(start);
      const endIndex = source.indexOf(end, startIndex + start.length);
      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(endIndex).toBeGreaterThan(startIndex);
      return source.slice(startIndex, endIndex);
    };

    const freshPreparation = section(
      "async function resetManuscriptForPreparation(",
      "async function resetEntityCanonForPreparation(",
    );
    const singleChapterReset = section(
      "export async function resetChapterStep(",
      "async function ensureChapterPostWrite(",
    );
    const generatedChapterCommit = section(
      "export async function writeChapterStep(",
      "export async function editChapterStep(",
    );
    const editorialCommit = section(
      "export async function editChapterStep(",
      "export async function readQualityGate(",
    );

    expect(freshPreparation).toContain("return withActiveAuthoringMutation(ref, async (tx) =>");
    expect(freshPreparation).toContain("tx.insert(schema.chapterRevisions)");
    expect(freshPreparation).toContain(".update(schema.chapters)");

    expect(singleChapterReset).toContain("await withActiveAuthoringMutation(ref, async (tx) =>");
    expect(singleChapterReset).toContain("tx.insert(schema.chapterRevisions)");
    expect(singleChapterReset).toContain(".update(schema.chapters)");

    expect(generatedChapterCommit).toContain(
      "const claimed = await withActiveAuthoringMutation(ref, async (tx) =>",
    );
    expect(generatedChapterCommit).toContain(
      "const persistedId = await withActiveAuthoringMutation(ref, async (tx) =>",
    );
    expect(generatedChapterCommit).not.toContain("persistChapter(");

    expect(editorialCommit).toContain("await withActiveAuthoringMutation(ref, async (tx) =>");
    expect(editorialCommit).toContain("tx.insert(schema.chapterRevisions)");
    expect(editorialCommit).toContain(".update(schema.chapters)");
  });

  it("keeps all remaining generated-output persistence behind the same lock", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/steps.ts"), "utf8");
    const section = (start: string, end: string) => {
      const startIndex = source.indexOf(start);
      const endIndex = source.indexOf(end, startIndex + start.length);
      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(endIndex).toBeGreaterThan(startIndex);
      return source.slice(startIndex, endIndex);
    };

    const canonReset = section(
      "async function resetEntityCanonForPreparation(",
      "export async function prepareBookRunStep(",
    );
    expect(canonReset).toContain("withActiveAuthoringMutation(ref, async (tx) =>");
    expect(canonReset).toContain(".delete(schema.entityRelationships)");
    expect(canonReset).toContain("tx.delete(schema.entities)");
    expect(canonReset).toContain("updateStoredGenerationConfigInTransaction(tx, ref");

    const preparation = section(
      "export async function prepareBookRunStep(",
      "export async function conceptStep(",
    );
    expect(preparation).toContain("ensureConceptPersisted(tx, book.id, stagedConcept)");
    expect(preparation).toContain("ensureOutlinePersisted(tx, book.id, stagedOutline)");
    expect(preparation.match(/withActiveAuthoringMutation\(ref, async \(tx\) =>/g)).toHaveLength(2);

    const entityBible = section(
      "export async function entityBibleStep(",
      "export async function resetChapterStep(",
    );
    const entityGenerationIndex = entityBible.indexOf("generateEntityBible(");
    const entityCommitIndex = entityBible.indexOf("withActiveAuthoringMutation(ref, async (tx) =>");
    expect(entityGenerationIndex).toBeGreaterThanOrEqual(0);
    expect(entityCommitIndex).toBeGreaterThan(entityGenerationIndex);
    expect(entityBible).toContain("persistEntityBible(book.id, bible, tx)");
    expect(entityBible).toContain("updateStoredGenerationConfigInTransaction(tx, ref");

    const chapterSummary = section(
      "async function ensureChapterPostWrite(",
      "export function resolvedChapterTargetWords(",
    );
    const summaryGenerationIndex = chapterSummary.indexOf("generateChapterSummary(");
    const summaryCommitIndex = chapterSummary.indexOf(
      "withActiveAuthoringMutation(ref, async (tx) =>",
    );
    expect(summaryGenerationIndex).toBeGreaterThanOrEqual(0);
    expect(summaryCommitIndex).toBeGreaterThan(summaryGenerationIndex);
    expect(chapterSummary).toContain(
      "persistChapterSummary(summaryInput, summaryCheckpoint.result, tx)",
    );
    expect(chapterSummary).toContain("updateStoredGenerationConfigInTransaction(tx, ref");

    const continuity = section(
      "export async function continuityFinalizeStep(",
      "export async function finalizeStep(",
    );
    expect(continuity).toContain("withActiveAuthoringMutation(ref, async (tx) =>");
    expect(continuity).toContain(
      "persistContinuityIssues(book.id, ref.dbRunId, report.issues, tx)",
    );
    expect(continuity).toContain("updateStoredGenerationConfigInTransaction(tx, ref");
  });

  it("keeps each multi-table persistence helper on one transaction", () => {
    const files = {
      concept: readFileSync(resolve(process.cwd(), "src/ai/agents/concept.ts"), "utf8"),
      outline: readFileSync(resolve(process.cwd(), "src/ai/agents/outline.ts"), "utf8"),
      summary: readFileSync(resolve(process.cwd(), "src/ai/agents/summarizer.ts"), "utf8"),
      bible: readFileSync(resolve(process.cwd(), "src/ai/agents/entity-bible.ts"), "utf8"),
      continuity: readFileSync(resolve(process.cwd(), "src/ai/agents/continuity.ts"), "utf8"),
    };

    expect(files.concept).toContain("await seedEntities(");
    expect(files.concept).toContain("if (transaction) return persist(transaction);");
    expect(files.concept).toContain("await withDbTransaction(persist);");

    expect(files.outline).toContain(
      "return transaction ? persist(transaction) : withDbTransaction(persist);",
    );
    expect(files.summary).toContain("await applyEntityDeltas(");
    expect(files.summary).toContain("await recordModerationFlag(");
    expect(files.summary).toContain("if (transaction) return persist(transaction);");
    expect(files.bible).toContain(
      "return transaction ? persist(transaction) : withDbTransaction(persist);",
    );
    expect(files.continuity).toContain("if (transaction) return persist(transaction);");
    expect(files.continuity).toContain("await withDbTransaction(persist);");
  });

  it("uses the legacy-compatible event allocator inside atomic finalization", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/steps.ts"), "utf8");
    const start = source.indexOf("export async function finalizeStep(");
    const end = source.indexOf("export async function notifyCreditsPausedStep(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const finalization = source.slice(start, end);

    expect(finalization).toContain("const allocatedDoneSeq = await nextRunEventSequence(");
    expect(finalization).toContain("seq: allocatedDoneSeq");
    expect(finalization).toContain(
      "nextEventSeq: existingDone ? allocatedDoneSeq : allocatedDoneSeq + 1",
    );
  });

  it("registers the versioned creative hook before exposing the question", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/generate-book.ts"), "utf8");
    const pauseStart = source.indexOf('allocateAuthoringPauseStep(ref, "creative_decision"');
    const hookCreated = source.indexOf("createHook<{ inputId: string }>", pauseStart);
    const conflictChecked = source.indexOf("await hook.getConflict()", hookCreated);
    const registered = source.indexOf(
      "await markCreativeQuestionPauseRegisteredStep",
      conflictChecked,
    );
    const exposed = source.indexOf('stage: "awaiting_guidance"', registered);
    const notified = source.indexOf("await notifyCreativeDecisionStep", exposed);
    const consumed = source.indexOf("await consumeCreativeDecisionStep", notified);
    const cleared = source.indexOf('clearAuthoringPauseStep(ref, "creative_decision"', consumed);

    expect(pauseStart).toBeGreaterThanOrEqual(0);
    expect(hookCreated).toBeGreaterThan(pauseStart);
    expect(conflictChecked).toBeGreaterThan(hookCreated);
    expect(registered).toBeGreaterThan(conflictChecked);
    expect(exposed).toBeGreaterThan(registered);
    expect(notified).toBeGreaterThan(exposed);
    expect(consumed).toBeGreaterThan(notified);
    expect(cleared).toBeGreaterThan(consumed);
  });

  it("hydrates an exact-input guided retry before any wallet or provider work", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/generate-book.ts"), "utf8");
    const running = source.indexOf('await markRunStatus(ref, "running")');
    const hydrated = source.indexOf("await hydratePreManuscriptRetryStep(ref, config)", running);
    const wallet = source.indexOf("await creativeOpeningCreditCheckStep(ref, config)", hydrated);
    const provider = source.indexOf("const developedConcept = await conceptStep(", hydrated);

    expect(running).toBeGreaterThanOrEqual(0);
    expect(hydrated).toBeGreaterThan(running);
    expect(wallet).toBeGreaterThan(hydrated);
    expect(provider).toBeGreaterThan(wallet);
  });
});
