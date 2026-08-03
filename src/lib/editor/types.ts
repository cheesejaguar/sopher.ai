import type { SuggestionAnchor } from "@/db/schema";

/**
 * Wire types shared between the chapter/suggestion API routes and the editor
 * client. Kept as plain serializable shapes (RSC/props friendly).
 */

export type SuggestionStatus = "pending" | "applied" | "rejected";
export type SuggestionPassType = "selection" | "review" | "proofread";
export type SuggestionSeverity = "info" | "warning" | "error";

export type SuggestionDTO = {
  id: string;
  chapterId: string;
  chapterVersion: number;
  passType: SuggestionPassType;
  suggestionType: string;
  severity: SuggestionSeverity;
  anchor: SuggestionAnchor;
  suggestedText: string;
  explanation: string;
  status: SuggestionStatus;
};

/** Row shape returned by drizzle for the suggestions table (subset we expose). */
export function toSuggestionDTO(row: {
  id: string;
  chapterId: string;
  chapterVersion: number;
  passType: SuggestionPassType;
  suggestionType: string;
  severity: SuggestionSeverity;
  anchor: SuggestionAnchor;
  suggestedText: string;
  explanation: string;
  status: SuggestionStatus;
}): SuggestionDTO {
  return {
    id: row.id,
    chapterId: row.chapterId,
    chapterVersion: row.chapterVersion,
    passType: row.passType,
    suggestionType: row.suggestionType,
    severity: row.severity,
    anchor: row.anchor,
    suggestedText: row.suggestedText,
    explanation: row.explanation,
    status: row.status,
  };
}

/** Response of POST /api/chapters/[chapterId]/edits */
export type SelectionEditResponse = { suggestion: SuggestionDTO };

/** Response of POST /api/chapters/[chapterId]/edits/[suggestionId] */
export type SuggestionActionResponse = {
  suggestion: SuggestionDTO;
  /** Present after an accept: the updated chapter the client should sync to. */
  chapter?: { content: string; version: number; wordCount: number };
  /** Present after an accept: all still-pending suggestions for the chapter. */
  pending?: SuggestionDTO[];
};

/** Response of POST /api/chapters/[chapterId]/review */
export type ReviewResponse = { suggestions: SuggestionDTO[]; skipped: number };

/** Content tool outputs (mirrors src/ai/content-tools/registry.ts). */
export type ContentToolOutputDTO =
  { kind: "mermaid"; source: string } | { kind: "image"; url: string; alt: string };

export type ContentToolResponse = {
  output: ContentToolOutputDTO;
  /** True when the server reused an earlier delivery for the same paid operation key. */
  replayed?: boolean;
};

/** Chapter row subset used by the editor sidebar / picker. */
export type ChapterNavItem = {
  id: string;
  chapterNumber: number;
  title: string | null;
  wordCount: number;
  status: "planned" | "drafting" | "drafted" | "edited" | "final";
};

/** Compact, status-only production context shown inside the chapter editor. */
export type EditorProductionStatus = {
  label: string;
  detail: string;
};
