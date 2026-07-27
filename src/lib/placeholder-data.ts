/**
 * Typed placeholder data for the studio shells.
 *
 * A later phase replaces every export here with real DB queries — components
 * should import the types and treat the constants as if they came from the
 * data layer.
 */

export type ProjectStatus = "draft" | "generating" | "editing" | "complete";

export type ChapterStatus = "planned" | "drafting" | "drafted" | "edited" | "final";

export type QualityTier = "draft" | "standard" | "premium";

export interface Project {
  id: string;
  title: string;
  genre: string;
  status: ProjectStatus;
  /** ISO timestamp of the last change to the book. */
  updatedAt: string;
  wordCount: number;
  chaptersDone: number;
  chaptersTotal: number;
  spendUsd: number;
  estimateUsd: number;
}

export interface Chapter {
  number: number;
  title: string;
  summary: string;
  status: ChapterStatus;
  wordCount: number;
}

export interface Brief {
  paragraphs: string[];
  genre: string;
  audience: string;
  tone: string;
  targetWords: number;
  qualityTier: QualityTier;
}

export interface AgentSpend {
  agent: string;
  role: string;
  calls: number;
  tokens: number;
  usd: number;
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  generating: "Generating",
  editing: "In edits",
  complete: "Complete",
};

export const chapterStatusLabels: Record<ChapterStatus, string> = {
  planned: "planned",
  drafting: "drafting",
  drafted: "drafted",
  edited: "edited",
  final: "final",
};

export const qualityTierLabels: Record<QualityTier, string> = {
  draft: "Draft",
  standard: "Standard",
  premium: "Premium",
};

export const MONTHLY_BUDGET_USD = 20;
export const MONTHLY_SPEND_USD = 6.42;

export const sampleProjects: Project[] = [
  {
    id: "saltglass-meridian",
    title: "The Saltglass Meridian",
    genre: "Literary mystery",
    status: "editing",
    updatedAt: "2026-07-26T18:40:00Z",
    wordCount: 61240,
    chaptersDone: 9,
    chaptersTotal: 12,
    spendUsd: 8.14,
    estimateUsd: 11.5,
  },
  {
    id: "emberwake",
    title: "Emberwake",
    genre: "Epic fantasy",
    status: "generating",
    updatedAt: "2026-07-27T09:12:00Z",
    wordCount: 23480,
    chaptersDone: 7,
    chaptersTotal: 24,
    spendUsd: 4.87,
    estimateUsd: 18.2,
  },
  {
    id: "orchard-at-lightfall",
    title: "The Orchard at Lightfall",
    genre: "Contemporary romance",
    status: "complete",
    updatedAt: "2026-07-11T21:05:00Z",
    wordCount: 74910,
    chaptersDone: 18,
    chaptersTotal: 18,
    spendUsd: 12.63,
    estimateUsd: 12.0,
  },
];

/** Chapters for "The Saltglass Meridian". */
export const sampleChapters: Chapter[] = [
  {
    number: 1,
    title: "The Tide Bell",
    summary: "Isla returns to Carrowmere for her aunt's funeral and finds the lighthouse dark.",
    status: "final",
    wordCount: 5180,
  },
  {
    number: 2,
    title: "Annealing",
    summary: "The glassworks reopens for the wake; a page is missing from the 1974 ledger.",
    status: "final",
    wordCount: 5320,
  },
  {
    number: 3,
    title: "What the Flood Kept",
    summary: "A storm surge returns a sealed jar of letters the sea took thirty years ago.",
    status: "edited",
    wordCount: 5510,
  },
  {
    number: 4,
    title: "The Archivist's Chair",
    summary: "The town archivist has been gone six weeks and nobody filed a report.",
    status: "edited",
    wordCount: 4980,
  },
  {
    number: 5,
    title: "Meridian Lines",
    summary: "Isla maps the aunt's glass floats and finds coordinates fused into the seams.",
    status: "edited",
    wordCount: 5240,
  },
  {
    number: 6,
    title: "A Door Left Ajar",
    summary: "Someone has been living in the lighthouse lamp room, and recently.",
    status: "edited",
    wordCount: 5075,
  },
  {
    number: 7,
    title: "Cullet",
    summary: "Broken glass in the harbor shallows matches a batch that was never sold.",
    status: "drafted",
    wordCount: 5390,
  },
  {
    number: 8,
    title: "The Second Signature",
    summary: "The ledger's missing page surfaces — countersigned by a woman declared dead.",
    status: "drafted",
    wordCount: 5120,
  },
  {
    number: 9,
    title: "Low Water",
    summary: "At the lowest tide of the year, the meridian stones spell out a route.",
    status: "drafted",
    wordCount: 5460,
  },
  {
    number: 10,
    title: "The Furnace Sermon",
    summary: "The glassmaster confesses what the town agreed to forget.",
    status: "drafting",
    wordCount: 2150,
  },
  {
    number: 11,
    title: "Nightglass",
    summary: "Isla relights the lamp and waits for whoever answers it.",
    status: "planned",
    wordCount: 0,
  },
  {
    number: 12,
    title: "The Saltglass Meridian",
    summary: "The archivist's route ends where the first chapter began.",
    status: "planned",
    wordCount: 0,
  },
];

/** The author's brief for "The Saltglass Meridian". */
export const sampleBrief: Brief = {
  paragraphs: [
    "A literary mystery set in Carrowmere, a fading glassmaking town on a cold northern coast. Isla Marren, a conservator who left at eighteen, comes home for her aunt's funeral and stays because the lighthouse — lit every night for a century — has gone dark, and no one will say why. The town archivist has quietly vanished, and the only record of what she was researching is a ledger with one page torn out.",
    "I want the mystery to move through objects rather than interrogations: glass floats with coordinates fused into the seams, a jar of letters returned by a storm, a batch of broken glass that was never sold. The tone should be elegiac and precise — closer to a tide chart than a thriller. The ending should resolve the archivist's disappearance without absolving the town; everyone kept the secret, and everyone pays a little for it.",
  ],
  genre: "Literary mystery",
  audience: "Adult",
  tone: "Elegiac, precise, quietly tense",
  targetWords: 80000,
  qualityTier: "standard",
};

/** Opening of chapter 1, "The Tide Bell" — used by the editor and manuscript shells. */
export const sampleProse: string[] = [
  "The tide bell rang twice before dawn, which in Carrowmere meant a death or a delivery, and no one had ordered glass in a month. Isla heard it from the ferry deck, a bronze note dragged flat by the wind, and counted the years since she had last stood close enough to hear it — nineteen, nearly twenty, long enough that the sound had become something she remembered rather than something she knew.",
  "The town came up out of the fog in pieces. First the breakwater, then the kilns with their cold chimneys, then the houses stacked on the hill like misfiled papers. The lighthouse stood where it had always stood, at the end of the meridian stones, and it took her the length of the harbor to understand what was wrong with it. The lamp was out. In her whole life, in her mother's whole life, the lamp had never been out.",
  "Her aunt's letters had stopped in March. The funeral notice had come in June, forwarded twice, addressed in a hand she didn't recognize. Between those two facts lay a season she could not account for, and Carrowmere was not a town that volunteered its seasons.",
  "She lifted her case — packed for four days, though some part of her had already decided otherwise — and stepped down onto the wet stone of home.",
];

/** Per-agent spend for "The Saltglass Meridian". */
export const sampleAgentSpend: AgentSpend[] = [
  {
    agent: "Concept",
    role: "Expanded the brief into a working premise",
    calls: 3,
    tokens: 41200,
    usd: 0.31,
  },
  {
    agent: "Outline",
    role: "Planned 12 chapters and the clue ladder",
    calls: 5,
    tokens: 88400,
    usd: 0.74,
  },
  {
    agent: "Chapter writers",
    role: "Drafted chapters in parallel",
    calls: 27,
    tokens: 612000,
    usd: 5.36,
  },
  { agent: "Editor", role: "Structural and line edits", calls: 14, tokens: 198600, usd: 1.48 },
  {
    agent: "Continuity",
    role: "Checked names, timeline, and tides",
    calls: 6,
    tokens: 74300,
    usd: 0.25,
  },
];

export function getProject(id: string): Project | undefined {
  return sampleProjects.find((project) => project.id === id);
}

export function getChapter(number: number): Chapter | undefined {
  return sampleChapters.find((chapter) => chapter.number === number);
}

/** The workspace stage a book naturally opens on, given its status. */
export function stageForStatus(status: ProjectStatus): "brief" | "write" | "editor" | "manuscript" {
  switch (status) {
    case "draft":
      return "brief";
    case "generating":
      return "write";
    case "editing":
      return "editor";
    case "complete":
      return "manuscript";
  }
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatWords(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Coarse relative date for card metadata — replaced by a real formatter later. */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "last week" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "last month" : `${months} months ago`;
}
