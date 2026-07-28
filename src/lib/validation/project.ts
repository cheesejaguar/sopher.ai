import { z } from "zod";

export const qualityTierSchema = z.enum(["draft", "standard", "premium"]);

export const projectSettingsSchema = z
  .object({
    pov: z.enum(["first", "third_limited", "third_omniscient"]).optional(),
    tense: z.enum(["past", "present"]).optional(),
    tone: z.string().max(200).optional(),
    voiceProfile: z.string().max(100).optional(),
    styleProfile: z.string().max(100).optional(),
    heatLevel: z.enum(["none", "mild", "moderate", "explicit"]).optional(),
    violenceLevel: z.enum(["none", "mild", "moderate", "graphic"]).optional(),
    profanity: z.enum(["none", "mild", "moderate", "strong"]).optional(),
    avoidTopics: z.array(z.string().max(100)).max(20).optional(),
    qualityTier: qualityTierSchema.optional(),
    requireOutlineApproval: z.boolean().optional(),
  })
  .strict();

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(20).max(20_000),
  genre: z.string().min(1).max(60),
  targetChapters: z.number().int().min(3).max(60).default(10),
  targetWordsPerChapter: z.number().int().min(800).max(8_000).default(3_000),
  styleGuide: z.string().max(10_000).optional(),
  settings: projectSettingsSchema.default({}),
});

export const updateProjectSchema = createProjectSchema.partial();

export const estimateRequestSchema = z.object({
  tier: qualityTierSchema,
  chapters: z.number().int().min(3).max(60),
  wordsPerChapter: z.number().int().min(800).max(8_000),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
