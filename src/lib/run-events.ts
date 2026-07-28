import { z } from "zod";

// The NDJSON contract between the generate-book workflow and the UI.
// Namespace "progress" carries these events; namespace "chapter:{n}" carries
// raw prose deltas (JSON-encoded strings) for the currently drafting chapter.

export const stageSchema = z.enum([
  "queued",
  "concept",
  "outline",
  "awaiting_approval",
  "chapters",
  "editing",
  "continuity",
  "revising",
  "finalizing",
  "done",
  "failed",
  "cancelled",
]);
export type Stage = z.infer<typeof stageSchema>;

export const runEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: stageSchema,
    pct: z.number().min(0).max(100),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("chapter"),
    chapterNumber: z.number().int(),
    status: z.enum(["planned", "drafting", "drafted", "edited", "final"]),
    wordCount: z.number().int().optional(),
    qualityScore: z.number().optional(),
  }),
  z.object({
    type: z.literal("agent"),
    agent: z.enum([
      "concept",
      "outliner",
      "entity-bible",
      "writer",
      "editor",
      "continuity",
      "summarizer",
    ]),
    message: z.string(),
    chapterNumber: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("cost"),
    totalUsd: z.number(),
  }),
  z.object({
    type: z.literal("review"),
    score: z.number(),
    recommendation: z.string(),
    issueCount: z.number().int(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    fatal: z.boolean(),
  }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

export const PROGRESS_NS = "progress";
export const chapterNs = (n: number) => `chapter:${n}`;

export type GenerationConfig = {
  tier: "draft" | "standard" | "premium";
  requireOutlineApproval: boolean;
  waveSize: number;
};
