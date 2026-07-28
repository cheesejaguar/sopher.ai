import { tool, type ToolSet } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { analyzeQuality, getQualityRecommendations } from "@/ai/analysis/quality-metrics";
import { analyzePacing } from "@/ai/analysis/pacing";
import { getGenreTemplate, chapterPromptForGenre, genreAvoidList } from "@/ai/knowledge/genres";
import { getTemplateSummary, chapterGuidance } from "@/ai/knowledge/plot-structures";

export type ToolCtx = {
  userId: string;
  projectId: string;
  bookId: string;
  chapterNumber?: number;
};

export type AgentRole = "writer" | "outliner" | "editor" | "continuity" | "concept";

function characterBibleGet(ctx: ToolCtx) {
  return tool({
    description:
      "Look up canonical facts about characters (appearance, personality, relationships, established facts). Always consult before writing a scene involving a character.",
    inputSchema: z.object({
      names: z.array(z.string()).min(1).max(8).describe("Character names to look up"),
    }),
    execute: async ({ names }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.characterBible)
        .where(eq(schema.characterBible.bookId, ctx.bookId));
      const wanted = new Set(names.map((n) => n.toLowerCase()));
      const found = rows.filter((r) => wanted.has(r.name.toLowerCase()));
      const missing = names.filter(
        (n) => !found.some((r) => r.name.toLowerCase() === n.toLowerCase()),
      );
      return {
        characters: found.map((r) => ({ name: r.name, facts: r.facts })),
        missing,
      };
    },
  });
}

function characterBibleUpdate(ctx: ToolCtx) {
  return tool({
    description:
      "Record new canonical facts you introduced for a character (names, injuries, promises, object locations, relationship changes). Call after drafting when you established something future chapters must honor.",
    inputSchema: z.object({
      name: z.string(),
      facts: z.array(z.string()).min(1).max(8).describe("New canonical facts, one per entry"),
    }),
    execute: async ({ name, facts }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(schema.characterBible)
        .where(
          and(eq(schema.characterBible.bookId, ctx.bookId), eq(schema.characterBible.name, name)),
        )
        .limit(1);
      if (existing) {
        const merged = {
          ...existing.facts,
          facts: [...(existing.facts.facts ?? []), ...facts],
        };
        await db
          .update(schema.characterBible)
          .set({
            facts: merged,
            updatedByChapter: ctx.chapterNumber,
            updatedAt: new Date(),
          })
          .where(eq(schema.characterBible.id, existing.id));
      } else {
        await db.insert(schema.characterBible).values({
          bookId: ctx.bookId,
          name,
          facts: { facts, firstAppearance: ctx.chapterNumber },
          updatedByChapter: ctx.chapterNumber,
        });
      }
      return { recorded: true, name, factCount: facts.length };
    },
  });
}

function storySoFarSearch(ctx: ToolCtx) {
  return tool({
    description:
      "Search summaries of earlier chapters for a specific event, object, place, or plot detail. Use instead of inventing or guessing what happened before.",
    inputSchema: z.object({
      query: z.string().min(2).describe("What to search for, in plain words"),
    }),
    execute: async ({ query }) => {
      const db = getDb();
      const rows = await db
        .select({
          chapterNumber: schema.chapters.chapterNumber,
          title: schema.chapters.title,
          summary: schema.chapters.summary,
        })
        .from(schema.chapters)
        .where(
          and(
            eq(schema.chapters.bookId, ctx.bookId),
            sql`to_tsvector('english', coalesce(${schema.chapters.summary}, '')) @@ websearch_to_tsquery('english', ${query})`,
          ),
        )
        .orderBy(schema.chapters.chapterNumber)
        .limit(5);
      return { matches: rows };
    },
  });
}

function storySoFarRecent(ctx: ToolCtx) {
  return tool({
    description: "Get the summaries of the most recent chapters before the one being written.",
    inputSchema: z.object({
      count: z.number().int().min(1).max(6).default(3),
    }),
    execute: async ({ count }) => {
      const db = getDb();
      const before = ctx.chapterNumber ?? Number.MAX_SAFE_INTEGER;
      const rows = await db
        .select({
          chapterNumber: schema.chapters.chapterNumber,
          title: schema.chapters.title,
          summary: schema.chapters.summary,
        })
        .from(schema.chapters)
        .where(
          and(
            eq(schema.chapters.bookId, ctx.bookId),
            sql`${schema.chapters.chapterNumber} < ${before}`,
            sql`${schema.chapters.summary} is not null`,
          ),
        )
        .orderBy(desc(schema.chapters.chapterNumber))
        .limit(count);
      return { summaries: rows.reverse() };
    },
  });
}

async function loadOutline(bookId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, bookId))
    .orderBy(desc(schema.outlines.version))
    .limit(1);
  return row?.content as
    | {
        title?: string;
        plotStructure?: string;
        chapters?: {
          number: number;
          title: string;
          summary: string;
          keyEvents?: string[];
          openingHook?: string;
          closingHook?: string;
        }[];
      }
    | undefined;
}

function outlineGetChapter(ctx: ToolCtx) {
  return tool({
    description: "Get the outline for a specific chapter (summary, key events, hooks).",
    inputSchema: z.object({ number: z.number().int().min(1) }),
    execute: async ({ number }) => {
      const outline = await loadOutline(ctx.bookId);
      const chapter = outline?.chapters?.find((c) => c.number === number);
      return chapter ?? { error: `No outline found for chapter ${number}` };
    },
  });
}

function outlineGetStructure(ctx: ToolCtx) {
  return tool({
    description:
      "Get the book's overall outline structure: title, plot structure, and one-line chapter summaries.",
    inputSchema: z.object({}),
    execute: async () => {
      const outline = await loadOutline(ctx.bookId);
      if (!outline) return { error: "No outline yet" };
      return {
        title: outline.title,
        plotStructure: outline.plotStructure,
        chapters: outline.chapters?.map((c) => ({
          number: c.number,
          title: c.title,
          summary: c.summary,
        })),
      };
    },
  });
}

function chaptersGetText(ctx: ToolCtx) {
  return tool({
    description:
      "Read the actual prose of an earlier chapter (optionally a character range) to verify wording, dialogue, or details before flagging or referencing them.",
    inputSchema: z.object({
      number: z.number().int().min(1),
      startChar: z.number().int().min(0).optional(),
      endChar: z.number().int().min(1).optional(),
    }),
    execute: async ({ number, startChar, endChar }) => {
      const db = getDb();
      const [row] = await db
        .select({ content: schema.chapters.content, title: schema.chapters.title })
        .from(schema.chapters)
        .where(
          and(eq(schema.chapters.bookId, ctx.bookId), eq(schema.chapters.chapterNumber, number)),
        )
        .limit(1);
      if (!row) return { error: `Chapter ${number} not found` };
      const text = row.content.slice(startChar ?? 0, endChar ?? (startChar ?? 0) + 6_000);
      return { chapterNumber: number, title: row.title, text };
    },
  });
}

function continuityRecordIssue(ctx: ToolCtx) {
  return tool({
    description:
      "Record a continuity issue you found (contradiction, timeline error, dropped thread) so it can be fixed and tracked.",
    inputSchema: z.object({
      chapters: z.array(z.number().int()).min(1).max(10),
      category: z.enum(["character", "timeline", "setting", "plot", "factual"]),
      severity: z.enum(["critical", "major", "minor"]),
      description: z.string(),
      suggestedFix: z.string(),
    }),
    execute: async (issue) => {
      const db = getDb();
      await db.insert(schema.continuityIssues).values({
        bookId: ctx.bookId,
        chapters: issue.chapters,
        category: issue.category,
        severity: issue.severity,
        description: issue.description,
        suggestedFix: issue.suggestedFix,
      });
      return { recorded: true };
    },
  });
}

const qualityAnalyze = tool({
  description:
    "Run free non-LLM quality heuristics on prose: readability, sentence variety, passive voice, adverb density, dialogue ratio, and pacing. Use to ground editing decisions in measurements.",
  inputSchema: z.object({ text: z.string().min(100) }),
  execute: async ({ text }) => {
    const quality = analyzeQuality(text);
    const pacing = analyzePacing(text);
    return {
      quality,
      pacing,
      recommendations: getQualityRecommendations(quality),
    };
  },
});

const knowledgePlotStructure = tool({
  description:
    "Look up a plot structure template (three_act, five_act, heros_journey, seven_point, save_the_cat) with its beats, or get per-chapter beat guidance.",
  inputSchema: z.object({
    structure: z.string(),
    chapterNumber: z.number().int().min(1).optional(),
    totalChapters: z.number().int().min(1).optional(),
  }),
  execute: async ({ structure, chapterNumber, totalChapters }) => {
    if (chapterNumber && totalChapters) {
      return (
        chapterGuidance(structure, chapterNumber, totalChapters) ?? { error: "Unknown structure" }
      );
    }
    return getTemplateSummary(structure) ?? { error: "Unknown structure" };
  },
});

const knowledgeGenre = tool({
  description:
    "Look up genre conventions: reader expectations, beat placement, what to avoid, and chapter-position guidance (opening/early/midpoint/late/climax/ending).",
  inputSchema: z.object({
    genre: z.string(),
    chapterPosition: z
      .enum(["opening", "early", "midpoint", "late", "climax", "ending"])
      .optional(),
  }),
  execute: async ({ genre, chapterPosition }) => {
    const template = getGenreTemplate(genre);
    if (!template) return { error: `Unknown genre: ${genre}` };
    if (chapterPosition) {
      return {
        guidance: chapterPromptForGenre(genre, chapterPosition),
        avoid: genreAvoidList(genre),
      };
    }
    return {
      name: template.genre,
      readerExpectations: template.readerExpectations,
      pacingNotes: template.pacingNotes,
      avoid: template.avoidList,
    };
  },
});

export function buildToolset(role: AgentRole, ctx: ToolCtx): ToolSet {
  switch (role) {
    case "writer":
      return {
        characterBibleGet: characterBibleGet(ctx),
        characterBibleUpdate: characterBibleUpdate(ctx),
        storySoFarSearch: storySoFarSearch(ctx),
        storySoFarRecent: storySoFarRecent(ctx),
        outlineGetChapter: outlineGetChapter(ctx),
        knowledgeGenre,
      };
    case "outliner":
      return {
        knowledgePlotStructure,
        knowledgeGenre,
        characterBibleGet: characterBibleGet(ctx),
      };
    case "editor":
      return {
        qualityAnalyze,
        outlineGetChapter: outlineGetChapter(ctx),
        characterBibleGet: characterBibleGet(ctx),
      };
    case "continuity":
      return {
        chaptersGetText: chaptersGetText(ctx),
        storySoFarSearch: storySoFarSearch(ctx),
        characterBibleGet: characterBibleGet(ctx),
        outlineGetStructure: outlineGetStructure(ctx),
        continuityRecordIssue: continuityRecordIssue(ctx),
      };
    case "concept":
      return { knowledgeGenre };
  }
}
