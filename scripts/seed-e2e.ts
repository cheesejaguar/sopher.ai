/**
 * Destructively reset and seed an isolated E2E database.
 *
 * Safety contract:
 * - The script never reads DATABASE_URL.
 * - E2E_DATABASE_ISOLATED=1, E2E_DATABASE_URL, and an exact
 *   E2E_DATABASE_HOST allowlist are required.
 * - The truncate and all inserts run in one Neon HTTP transaction.
 * - --dry-run validates every structured fixture without opening a connection.
 *
 * Run:
 *   E2E_DATABASE_ISOLATED=1 E2E_DATABASE_URL=postgresql://... pnpm e2e:seed
 */
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import {
  bookOutlineSchema,
  conceptSchema,
  type BookOutline,
  type BookConcept,
} from "../src/ai/schemas";
import { parseAttrs, type EntityKind } from "../src/ai/schemas/entities";
import * as schema from "../src/db/schema";
import { countWords } from "../src/lib/editor/anchors";
import { runEventSchema, type RunEvent } from "../src/lib/run-events";

const IDS = {
  user: "dev-user",
  project: "11111111-1111-4111-8111-111111111111",
  book: "22222222-2222-4222-8222-222222222222",
  outline: "33333333-3333-4333-8333-333333333333",
  chapters: [
    "44444444-4444-4444-8444-444444444441",
    "44444444-4444-4444-8444-444444444442",
    "44444444-4444-4444-8444-444444444443",
  ],
  revisions: ["55555555-5555-4555-8555-555555555551", "55555555-5555-4555-8555-555555555552"],
  entities: [
    "66666666-6666-4666-8666-666666666661",
    "66666666-6666-4666-8666-666666666662",
    "66666666-6666-4666-8666-666666666663",
  ],
  relationships: ["77777777-7777-4777-8777-777777777771", "77777777-7777-4777-8777-777777777772"],
  run: "88888888-8888-4888-8888-888888888888",
  events: [
    "99999999-9999-4999-8999-999999999991",
    "99999999-9999-4999-8999-999999999992",
    "99999999-9999-4999-8999-999999999993",
    "99999999-9999-4999-8999-999999999994",
    "99999999-9999-4999-8999-999999999995",
    "99999999-9999-4999-8999-999999999996",
    "99999999-9999-4999-8999-999999999997",
    "99999999-9999-4999-8999-999999999998",
    "99999999-9999-4999-8999-999999999999",
    "99999999-9999-4999-8999-999999999990",
  ],
  llmCalls: [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  ],
  ledger: [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  ],
  suggestions: [
    "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
    "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  ],
  continuity: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  moderation: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  analytics: ["ffffffff-ffff-4fff-8fff-fffffffffff1", "ffffffff-ffff-4fff-8fff-fffffffffff2"],
} as const;

/**
 * Authoring-journey acceptance fixtures. The titles are intentionally explicit
 * so browser tests can select a state without relying on card order.
 */
const JOURNEY_IDS = {
  projects: {
    briefNoRun: "10101010-0000-4000-8000-000000000001",
    dispatchUncertain: "10101010-0000-4000-8000-000000000002",
    outlineApproval: "10101010-0000-4000-8000-000000000003",
    creditsPause: "10101010-0000-4000-8000-000000000004",
    partialFailure: "10101010-0000-4000-8000-000000000005",
    degradedTelemetry: "10101010-0000-4000-8000-000000000006",
    cancellationRequested: "10101010-0000-4000-8000-000000000007",
    invalidCompletion: "10101010-0000-4000-8000-000000000008",
  },
  books: {
    outlineApproval: "20202020-0000-4000-8000-000000000003",
    creditsPause: "20202020-0000-4000-8000-000000000004",
    partialFailure: "20202020-0000-4000-8000-000000000005",
    degradedTelemetry: "20202020-0000-4000-8000-000000000006",
    cancellationRequested: "20202020-0000-4000-8000-000000000007",
    invalidCompletion: "20202020-0000-4000-8000-000000000008",
  },
  outlines: {
    outlineApproval: "30303030-0000-4000-8000-000000000003",
    creditsPause: "30303030-0000-4000-8000-000000000004",
  },
  chapters: {
    creditsPause: "60606060-0000-4000-8000-000000000004",
    partialFailureOne: "60606060-0000-4000-8000-000000000051",
    partialFailureTwo: "60606060-0000-4000-8000-000000000052",
    cancellationRequested: "60606060-0000-4000-8000-000000000007",
    invalidCompletion: "60606060-0000-4000-8000-000000000008",
  },
  runs: {
    dispatchUncertain: "40404040-0000-4000-8000-000000000002",
    outlineApproval: "40404040-0000-4000-8000-000000000003",
    creditsPause: "40404040-0000-4000-8000-000000000004",
    partialFailure: "40404040-0000-4000-8000-000000000005",
    degradedTelemetry: "40404040-0000-4000-8000-000000000006",
    cancellationRequested: "40404040-0000-4000-8000-000000000007",
    invalidCompletion: "40404040-0000-4000-8000-000000000008",
  },
  support: {
    dispatchUncertain: "50505050-0000-4000-8000-000000000002",
    outlineApproval: "50505050-0000-4000-8000-000000000003",
    creditsPause: "50505050-0000-4000-8000-000000000004",
    partialFailure: "50505050-0000-4000-8000-000000000005",
    degradedTelemetry: "50505050-0000-4000-8000-000000000006",
    cancellationRequested: "50505050-0000-4000-8000-000000000007",
    invalidCompletion: "50505050-0000-4000-8000-000000000008",
  },
} as const;

const CREATED_AT = new Date("2026-07-27T16:00:00.000Z");
const RUN_STARTED_AT = new Date("2026-07-28T15:00:00.000Z");
const RUN_COMPLETED_AT = new Date("2026-07-28T15:18:00.000Z");
const UPDATED_AT = new Date("2026-07-29T16:00:00.000Z");
const JOURNEY_UPDATED_AT = new Date("2026-07-29T12:00:00.000Z");
const ACTIVE_RUN_AT = new Date(Date.now() - 5 * 60_000);
const STALE_DISPATCH_AT = new Date(Date.now() - 20 * 60_000);

const chapterContents = [
  `# The Brass Compass

Mara checked the brass compass twice. Its needle ignored north and pointed through the workshop floor, where the old clockwork hummed beneath the boards.

She had inherited the shop that morning: twelve narrow windows, a wall of stopped watches, and one unsigned note from her grandfather. The note said only that the map would reveal itself when the city forgot the hour.

At dusk, every public clock in Bellweather stopped. The clock beneath the floor kept perfect time.

Mara knelt beside the loose board and listened. A second rhythm answered the clock: three patient knocks from somewhere below. She lifted the plank and found a stairway descending into blue light, its first step dustless, as if someone had used it moments before.

She pocketed the compass, left the shop sign turned to CLOSED, and followed the light underground.`,
  `# The Room Beneath the Hour

The stair ended in a circular chamber lined with brass shelves. Each shelf held a glass tile etched with a different street, bridge, or rooftop from Bellweather.

Mara placed the compass at the center of the room. The tiles rose in sequence and assembled themselves into a floating map. One district was missing: the river quarter where her grandfather had vanished seven years earlier.

A quiet mechanism clicked behind her. Elias Venn, the municipal clock keeper, stepped from the shadows with both hands raised. He claimed the stopped clocks were a warning, not a failure. Someone had begun removing hours from the city, and the missing quarter was only the first place to slip out of time.

The map pulsed once. Across its glass surface, a new route appeared in violet light and led straight toward the sealed observatory.`,
  `# The Observatory Door

Rain silvered the observatory dome while Mara and Elias crossed the abandoned square. No bell marked the hour. Without the city's clocks, every footstep seemed too loud.

The brass compass opened the observatory door, but the mechanism accepted only Mara's hand. Inside, a projector cast the missing river quarter across the ceiling. Its streets were intact, suspended in a single unfinished minute.

Mara found her grandfather's final calibration notes beside the projector. He had not built the map to predict the future. He had built it to return stolen time to the people who owned it.

When the figure behind the theft spoke from the upper gallery, Mara did not run. She turned the compass toward the projection and watched its needle become a line of light. The route home was no longer hidden. It was waiting for an author.`,
] as const;

function anchorFor(content: string, originalText: string) {
  const start = content.indexOf(originalText);
  if (start < 0) {
    throw new Error(`E2E fixture anchor is missing from chapter content: ${originalText}`);
  }
  return { start, end: start + originalText.length, originalText };
}

const concept: BookConcept = conceptSchema.parse({
  title: "The Clockmaker's Map",
  logline:
    "An apprentice clockmaker follows a compass into the machinery beneath her city and discovers that someone is stealing time.",
  synopsis:
    "Mara Vale inherits a workshop, a cryptic note, and a compass that points toward a hidden map of Bellweather. When the city's clocks stop, she must trace a missing district and reclaim the hours taken from its people.",
  themes: ["creative ownership", "memory", "inheritance"],
  setting: "Bellweather, a canal city of public clocks and sealed observatories",
  centralConflict:
    "Mara must learn how the hidden map works before the missing river quarter disappears permanently.",
  uniqueElements: ["A compass that points through time", "A map assembled from glass city tiles"],
  characters: [
    {
      name: "Mara Vale",
      role: "Protagonist",
      description: "An observant apprentice clockmaker who trusts evidence more than legends.",
      arc: "She grows from reluctant inheritor into the deliberate author of her own work.",
    },
    {
      name: "Elias Venn",
      role: "Ally",
      description: "Bellweather's reserved municipal clock keeper.",
      arc: "He learns to share the knowledge he once guarded.",
    },
  ],
  moderation: { flagged: false },
});

const outline: BookOutline = bookOutlineSchema.parse({
  title: "The Clockmaker's Map",
  logline:
    "An apprentice clockmaker follows a compass into the machinery beneath her city and discovers that someone is stealing time.",
  synopsis:
    "Mara uncovers a hidden map, traces a district suspended outside time, and chooses to restore its stolen hours.",
  themes: ["creative ownership", "memory", "inheritance"],
  plotStructure: "three-act",
  chapters: [
    {
      number: 1,
      title: "The Brass Compass",
      summary: "Mara inherits the workshop and discovers a stair beneath its oldest clock.",
      keyEvents: ["The public clocks stop", "The compass reveals a hidden stair"],
      charactersPresent: ["Mara Vale"],
      emotionalArc: "exposition",
      openingHook: "A compass refuses to point north.",
      closingHook: "Three knocks answer from below the workshop.",
      targetWords: 1200,
    },
    {
      number: 2,
      title: "The Room Beneath the Hour",
      summary: "A glass map reveals that Bellweather's river quarter has disappeared.",
      keyEvents: ["The map assembles", "Elias explains the stolen hours"],
      charactersPresent: ["Mara Vale", "Elias Venn"],
      emotionalArc: "rising_action",
      openingHook: "The stair opens into a room made to map the city.",
      closingHook: "A route appears toward the sealed observatory.",
      targetWords: 1200,
    },
    {
      number: 3,
      title: "The Observatory Door",
      summary: "Mara learns the map can restore stolen time and chooses to activate it.",
      keyEvents: ["The observatory opens", "Mara finds the calibration notes"],
      charactersPresent: ["Mara Vale", "Elias Venn"],
      emotionalArc: "climax",
      openingHook: "The city's silence follows Mara to the observatory.",
      closingHook: "The route home waits for an author.",
      targetWords: 1200,
    },
  ],
});

const entityFixtures: {
  id: string;
  kind: EntityKind;
  name: string;
  aliases: string[];
  attrs: Record<string, unknown>;
  firstAppearanceChapter: number;
  lastUpdatedChapter: number;
}[] = [
  {
    id: IDS.entities[0],
    kind: "character",
    name: "Mara Vale",
    aliases: ["Mara"],
    attrs: parseAttrs("character", {
      role: "protagonist",
      occupation: "apprentice clockmaker",
      appearance: "Ink-dark hair, practical coat, brass watch chain",
      personality: ["observant", "persistent", "precise"],
      goals: ["Find her grandfather", "Restore the missing river quarter"],
      facts: ["The brass compass responds to her touch."],
    }),
    firstAppearanceChapter: 1,
    lastUpdatedChapter: 3,
  },
  {
    id: IDS.entities[1],
    kind: "location",
    name: "Vale Clockworks",
    aliases: ["the workshop"],
    attrs: parseAttrs("location", {
      locationType: "clockmaker's workshop",
      description: "A narrow shop with twelve windows and a hidden stair.",
      features: ["wall of stopped watches", "loose floorboard", "hidden clockwork"],
      owner: "Mara Vale",
      facts: ["A clock beneath the floor keeps running when the city clocks stop."],
    }),
    firstAppearanceChapter: 1,
    lastUpdatedChapter: 2,
  },
  {
    id: IDS.entities[2],
    kind: "object",
    name: "Brass Compass",
    aliases: ["the compass"],
    attrs: parseAttrs("object", {
      description: "A palm-sized brass compass whose needle ignores north.",
      significance: "It opens the hidden machinery and reveals routes through displaced time.",
      provenance: "Left to Mara by her grandfather.",
      holder: "Mara Vale",
      capabilities: ["points toward temporal machinery", "opens the observatory"],
      facts: ["Its needle becomes a line of violet light inside the observatory."],
    }),
    firstAppearanceChapter: 1,
    lastUpdatedChapter: 3,
  },
];

const runEvents: RunEvent[] = [
  { type: "stage", stage: "concept", pct: 8, detail: "Shaping the story promise" },
  { type: "agent", agent: "concept", message: "Concept and cast established." },
  { type: "stage", stage: "outline", pct: 22, detail: "Building the chapter route" },
  { type: "agent", agent: "outliner", message: "Three-chapter outline approved." },
  { type: "stage", stage: "chapters", pct: 45, detail: "Drafting the manuscript" },
  {
    type: "chapter",
    chapterNumber: 1,
    status: "edited",
    wordCount: countWords(chapterContents[0]),
  },
  {
    type: "chapter",
    chapterNumber: 2,
    status: "final",
    wordCount: countWords(chapterContents[1]),
  },
  { type: "cost", totalUsd: 1.75 },
  {
    type: "review",
    score: 0.91,
    recommendation: "Ready for the author's final pass.",
    issueCount: 1,
  },
  { type: "stage", stage: "done", pct: 100, detail: "Manuscript ready to refine" },
].map((event) => runEventSchema.parse(event));

const chapterRows = chapterContents.map((content, index) => ({
  id: IDS.chapters[index],
  bookId: IDS.book,
  chapterNumber: index + 1,
  title: outline.chapters[index].title,
  summary: outline.chapters[index].summary,
  content,
  wordCount: countWords(content),
  version: index === 0 ? 4 : 2,
  qualityScore: index === 0 ? "0.914" : index === 1 ? "0.932" : "0.887",
  status: "final" as const,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
}));

const suggestionRows = [
  {
    id: IDS.suggestions[0],
    chapterId: IDS.chapters[0],
    runId: IDS.run,
    chapterVersion: 4,
    passType: "review" as const,
    suggestionType: "rhythm",
    severity: "info" as const,
    anchor: anchorFor(chapterContents[0], "Mara checked the brass compass twice."),
    suggestedText: "Mara checked the brass compass, then checked it once more.",
    explanation: "The repeated action lands more deliberately when the second beat is visible.",
    instruction: "Keep Mara precise without making the sentence feel mechanical.",
    status: "pending" as const,
    createdAt: UPDATED_AT,
  },
  {
    id: IDS.suggestions[1],
    chapterId: IDS.chapters[0],
    runId: IDS.run,
    chapterVersion: 4,
    passType: "proofread" as const,
    suggestionType: "clarity",
    severity: "warning" as const,
    anchor: anchorFor(chapterContents[0], "The clock beneath the floor kept perfect time."),
    suggestedText: "Only the clock beneath the floor kept perfect time.",
    explanation: "The revision sharpens the contrast with every stopped clock above.",
    instruction: null,
    status: "pending" as const,
    createdAt: UPDATED_AT,
  },
  {
    id: IDS.suggestions[2],
    chapterId: IDS.chapters[0],
    runId: IDS.run,
    chapterVersion: 4,
    passType: "review" as const,
    suggestionType: "pacing",
    severity: "info" as const,
    anchor: anchorFor(
      chapterContents[0],
      "She pocketed the compass, left the shop sign turned to CLOSED, and followed the light underground.",
    ),
    suggestedText:
      "She pocketed the compass, turned the shop sign to CLOSED, and followed the blue light underground.",
    explanation: "The tighter sequence keeps the final action moving toward the chapter break.",
    instruction: "Preserve the physical decisions that make Mara feel in control.",
    status: "pending" as const,
    createdAt: UPDATED_AT,
  },
];

const journeyProjects: (typeof schema.projects.$inferInsert)[] = [
  {
    id: JOURNEY_IDS.projects.briefNoRun,
    userId: IDS.user,
    title: "The Lantern Index",
    brief:
      "A junior archivist learns that every lantern in the city keeps one forgotten memory and must return the right one before sunrise.",
    genre: "Fantasy",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: true },
    status: "draft",
    createdAt: CREATED_AT,
    updatedAt: JOURNEY_UPDATED_AT,
  },
  {
    id: JOURNEY_IDS.projects.dispatchUncertain,
    userId: IDS.user,
    title: "Signal at Low Tide",
    brief:
      "A volunteer lighthouse keeper receives a radio call from a ship that vanished thirty years ago.",
    genre: "Mystery",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: true },
    status: "generating",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 60_000),
  },
  {
    id: JOURNEY_IDS.projects.outlineApproval,
    userId: IDS.user,
    title: "The Map of Borrowed Roads",
    brief:
      "A bicycle courier discovers a map that lends travelers roads from lives they almost lived.",
    genre: "Fantasy",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: true },
    status: "generating",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 2 * 60_000),
  },
  {
    id: JOURNEY_IDS.projects.creditsPause,
    userId: IDS.user,
    title: "A Choir for Europa",
    brief:
      "A maintenance engineer beneath Europa's ice hears a human harmony where no expedition has ever gone.",
    genre: "Science Fiction",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: true },
    status: "generating",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 3 * 60_000),
  },
  {
    id: JOURNEY_IDS.projects.partialFailure,
    userId: IDS.user,
    title: "The Orchard Below",
    brief:
      "Two sisters find an underground orchard whose fruit grows a different version of their family history.",
    genre: "Literary Fiction",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: false },
    status: "editing",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 4 * 60_000),
  },
  {
    id: JOURNEY_IDS.projects.degradedTelemetry,
    userId: IDS.user,
    title: "The Last Weather Station",
    brief:
      "A mountain meteorologist keeps writing forecasts after every town below has disappeared from the radio.",
    genre: "Science Fiction",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: false },
    status: "generating",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 5 * 60_000),
  },
  {
    id: JOURNEY_IDS.projects.cancellationRequested,
    userId: IDS.user,
    title: "Glasswing County",
    brief:
      "A county surveyor follows a migration of glass-winged moths toward a town omitted from every official map.",
    genre: "Mystery",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: false },
    status: "generating",
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 6 * 60_000),
  },
  {
    id: JOURNEY_IDS.projects.invalidCompletion,
    userId: IDS.user,
    title: "The House That Counted",
    brief:
      "A child notices that her house counts every visitor except the person living in the attic.",
    genre: "Horror",
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    settings: { qualityTier: "standard", requireOutlineApproval: false },
    status: "complete",
    completedAt: RUN_COMPLETED_AT,
    createdAt: CREATED_AT,
    updatedAt: new Date(JOURNEY_UPDATED_AT.getTime() - 7 * 60_000),
  },
];

const journeyBooks: (typeof schema.books.$inferInsert)[] = [
  [
    JOURNEY_IDS.books.outlineApproval,
    JOURNEY_IDS.projects.outlineApproval,
    "The Map of Borrowed Roads",
  ],
  [JOURNEY_IDS.books.creditsPause, JOURNEY_IDS.projects.creditsPause, "A Choir for Europa"],
  [JOURNEY_IDS.books.partialFailure, JOURNEY_IDS.projects.partialFailure, "The Orchard Below"],
  [
    JOURNEY_IDS.books.degradedTelemetry,
    JOURNEY_IDS.projects.degradedTelemetry,
    "The Last Weather Station",
  ],
  [
    JOURNEY_IDS.books.cancellationRequested,
    JOURNEY_IDS.projects.cancellationRequested,
    "Glasswing County",
  ],
  [
    JOURNEY_IDS.books.invalidCompletion,
    JOURNEY_IDS.projects.invalidCompletion,
    "The House That Counted",
  ],
].map(([id, projectId, title]) => ({
  id,
  projectId,
  title,
  synopsis: `A deterministic browser fixture for ${title}.`,
  concept: { ...concept, title },
  frontMatter: { author: "E2E Sample Author" },
  createdAt: CREATED_AT,
  updatedAt: JOURNEY_UPDATED_AT,
}));

const journeyOutlines: (typeof schema.outlines.$inferInsert)[] = [
  {
    id: JOURNEY_IDS.outlines.outlineApproval,
    bookId: JOURNEY_IDS.books.outlineApproval,
    version: 1,
    content: { ...outline, title: "The Map of Borrowed Roads" },
    source: "ai",
    createdAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.outlines.creditsPause,
    bookId: JOURNEY_IDS.books.creditsPause,
    version: 1,
    content: { ...outline, title: "A Choir for Europa" },
    source: "ai",
    createdAt: ACTIVE_RUN_AT,
  },
];

const journeyChapters: (typeof schema.chapters.$inferInsert)[] = [
  {
    id: JOURNEY_IDS.chapters.creditsPause,
    bookId: JOURNEY_IDS.books.creditsPause,
    chapterNumber: 1,
    title: "The Sound Beneath the Ice",
    summary: "The first signal reaches the station.",
    content: chapterContents[0],
    wordCount: countWords(chapterContents[0]),
    status: "drafted",
    createdAt: RUN_STARTED_AT,
    updatedAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.chapters.partialFailureOne,
    bookId: JOURNEY_IDS.books.partialFailure,
    chapterNumber: 1,
    title: "Root Cellar",
    summary: "The sisters find the first impossible tree.",
    content: chapterContents[0],
    wordCount: countWords(chapterContents[0]),
    status: "edited",
    createdAt: RUN_STARTED_AT,
    updatedAt: RUN_COMPLETED_AT,
  },
  {
    id: JOURNEY_IDS.chapters.partialFailureTwo,
    bookId: JOURNEY_IDS.books.partialFailure,
    chapterNumber: 2,
    title: "Second Harvest",
    summary: "A different family memory begins to take hold.",
    content: chapterContents[1],
    wordCount: countWords(chapterContents[1]),
    status: "drafted",
    createdAt: RUN_STARTED_AT,
    updatedAt: RUN_COMPLETED_AT,
  },
  {
    id: JOURNEY_IDS.chapters.cancellationRequested,
    bookId: JOURNEY_IDS.books.cancellationRequested,
    chapterNumber: 1,
    title: "County Line",
    summary: "The surveyor follows the moths beyond the marked road.",
    content: chapterContents[0],
    wordCount: countWords(chapterContents[0]),
    status: "drafted",
    createdAt: RUN_STARTED_AT,
    updatedAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.chapters.invalidCompletion,
    bookId: JOURNEY_IDS.books.invalidCompletion,
    chapterNumber: 1,
    title: "One Visitor Missing",
    summary: "The house's count first contradicts the family.",
    content: chapterContents[0],
    wordCount: countWords(chapterContents[0]),
    status: "final",
    createdAt: RUN_STARTED_AT,
    updatedAt: RUN_COMPLETED_AT,
  },
];

const journeyRunConfig = {
  protocolVersion: 2,
  tier: "standard",
  targetChapters: 3,
  targetWordsPerChapter: 1000,
  requireOutlineApproval: true,
  waveSize: 1,
} as const;

const journeyRuns: (typeof schema.generationRuns.$inferInsert)[] = [
  {
    id: JOURNEY_IDS.runs.dispatchUncertain,
    projectId: JOURNEY_IDS.projects.dispatchUncertain,
    userId: IDS.user,
    kind: "full_book",
    status: "queued",
    config: journeyRunConfig,
    currentStage: "queued",
    stageDescription: "Waiting for the writing room to confirm",
    dispatchAttempts: 2,
    acceptanceUncertainAt: STALE_DISPATCH_AT,
    acceptanceDispatchClaimedAt: STALE_DISPATCH_AT,
    supportReference: JOURNEY_IDS.support.dispatchUncertain,
    createdAt: STALE_DISPATCH_AT,
  },
  {
    id: JOURNEY_IDS.runs.outlineApproval,
    projectId: JOURNEY_IDS.projects.outlineApproval,
    userId: IDS.user,
    kind: "full_book",
    status: "awaiting_input",
    config: journeyRunConfig,
    currentStage: "awaiting_approval",
    progressPct: 24,
    stageDescription: "The outline is ready for your decision",
    startedAt: ACTIVE_RUN_AT,
    lastProgressAt: ACTIVE_RUN_AT,
    heartbeatAt: ACTIVE_RUN_AT,
    workflowObservedStatus: "running",
    workflowObservedAt: ACTIVE_RUN_AT,
    dispatchAttempts: 1,
    pauseKind: "outline_approval",
    pauseVersion: 1,
    pauseKey: "e2e-outline-approval-v1",
    pauseRegisteredAt: ACTIVE_RUN_AT,
    supportReference: JOURNEY_IDS.support.outlineApproval,
    createdAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.runs.creditsPause,
    projectId: JOURNEY_IDS.projects.creditsPause,
    userId: IDS.user,
    kind: "full_book",
    status: "awaiting_input",
    config: journeyRunConfig,
    currentStage: "awaiting_credits",
    progressPct: 46,
    stageDescription: "One chapter is saved at a safe credit boundary",
    startedAt: ACTIVE_RUN_AT,
    lastProgressAt: ACTIVE_RUN_AT,
    heartbeatAt: ACTIVE_RUN_AT,
    workflowObservedStatus: "running",
    workflowObservedAt: ACTIVE_RUN_AT,
    dispatchAttempts: 1,
    pauseKind: "credits_topup",
    pauseVersion: 1,
    pauseKey: "e2e-credits-topup-v1",
    pauseDetails: { balanceCredits: 0.25, requiredCredits: 2.5, resumeStage: "chapters" },
    pauseRegisteredAt: ACTIVE_RUN_AT,
    supportReference: JOURNEY_IDS.support.creditsPause,
    createdAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.runs.partialFailure,
    projectId: JOURNEY_IDS.projects.partialFailure,
    userId: IDS.user,
    kind: "full_book",
    status: "failed",
    config: { ...journeyRunConfig, requireOutlineApproval: false },
    currentStage: "failed",
    progressPct: 58,
    stageDescription: "Production stopped after two saved chapters",
    rootErrorCode: "E2E_INTERRUPTED",
    rootErrorStage: "chapters",
    error: "The isolated fixture interrupted production after a durable chapter commit.",
    startedAt: RUN_STARTED_AT,
    completedAt: RUN_COMPLETED_AT,
    lastProgressAt: RUN_COMPLETED_AT,
    heartbeatAt: RUN_COMPLETED_AT,
    workflowObservedStatus: "failed",
    workflowObservedAt: RUN_COMPLETED_AT,
    dispatchAttempts: 1,
    supportReference: JOURNEY_IDS.support.partialFailure,
    createdAt: RUN_STARTED_AT,
  },
  {
    id: JOURNEY_IDS.runs.degradedTelemetry,
    projectId: JOURNEY_IDS.projects.degradedTelemetry,
    userId: IDS.user,
    workflowRunId: "e2e-workflow-unavailable",
    kind: "full_book",
    status: "running",
    config: { ...journeyRunConfig, requireOutlineApproval: false },
    currentStage: "chapters",
    progressPct: 41,
    stageDescription: "Drafting chapter two",
    startedAt: ACTIVE_RUN_AT,
    lastProgressAt: ACTIVE_RUN_AT,
    heartbeatAt: ACTIVE_RUN_AT,
    workflowObservedStatus: "unavailable",
    workflowObservedAt: ACTIVE_RUN_AT,
    dispatchAttempts: 1,
    supportReference: JOURNEY_IDS.support.degradedTelemetry,
    createdAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.runs.cancellationRequested,
    projectId: JOURNEY_IDS.projects.cancellationRequested,
    userId: IDS.user,
    workflowRunId: "e2e-workflow-cancelling",
    kind: "full_book",
    status: "running",
    config: { ...journeyRunConfig, requireOutlineApproval: false },
    currentStage: "chapters",
    progressPct: 37,
    stageDescription: "Finishing the current safe boundary",
    startedAt: ACTIVE_RUN_AT,
    lastProgressAt: ACTIVE_RUN_AT,
    heartbeatAt: ACTIVE_RUN_AT,
    workflowObservedStatus: "running",
    workflowObservedAt: ACTIVE_RUN_AT,
    dispatchAttempts: 1,
    cancellationRequestedAt: new Date(ACTIVE_RUN_AT.getTime() + 2 * 60_000),
    cancellationReason: "Author requested a safe stop from the Write room.",
    supportReference: JOURNEY_IDS.support.cancellationRequested,
    createdAt: ACTIVE_RUN_AT,
  },
  {
    id: JOURNEY_IDS.runs.invalidCompletion,
    projectId: JOURNEY_IDS.projects.invalidCompletion,
    userId: IDS.user,
    kind: "full_book",
    status: "completed",
    config: { ...journeyRunConfig, requireOutlineApproval: false },
    currentStage: "done",
    progressPct: 100,
    stageDescription: "Completion reported without every expected chapter",
    startedAt: RUN_STARTED_AT,
    completedAt: RUN_COMPLETED_AT,
    lastProgressAt: RUN_COMPLETED_AT,
    heartbeatAt: RUN_COMPLETED_AT,
    workflowObservedStatus: "completed",
    workflowObservedAt: RUN_COMPLETED_AT,
    dispatchAttempts: 1,
    supportReference: JOURNEY_IDS.support.invalidCompletion,
    createdAt: RUN_STARTED_AT,
  },
];

function requireIsolatedDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_ISOLATED !== "1") {
    throw new Error(
      "Refusing destructive E2E seed: set E2E_DATABASE_ISOLATED=1 only for a disposable database branch.",
    );
  }

  const value = process.env.E2E_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "Refusing destructive E2E seed: E2E_DATABASE_URL must identify the disposable database branch.",
    );
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
      "Refusing destructive E2E seed: E2E_DATABASE_HOST must exactly match the disposable branch hostname.",
    );
  }

  return value;
}

function validateFixtureShape() {
  const checks: [label: string, actual: number, expected: number][] = [
    ["chapter ids", IDS.chapters.length, chapterRows.length],
    ["outline chapters", outline.chapters.length, chapterRows.length],
    ["event ids", IDS.events.length, runEvents.length],
    ["suggestion ids", IDS.suggestions.length, suggestionRows.length],
    ["journey projects", Object.keys(JOURNEY_IDS.projects).length, journeyProjects.length],
    ["journey books", Object.keys(JOURNEY_IDS.books).length, journeyBooks.length],
    ["journey outlines", Object.keys(JOURNEY_IDS.outlines).length, journeyOutlines.length],
    ["journey chapters", Object.keys(JOURNEY_IDS.chapters).length, journeyChapters.length],
    ["journey runs", Object.keys(JOURNEY_IDS.runs).length, journeyRuns.length],
  ];
  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`Invalid E2E fixture: ${label} has ${actual} entries; expected ${expected}.`);
    }
  }
}

async function main() {
  const databaseUrl = requireIsolatedDatabaseUrl();
  validateFixtureShape();
  const parsedUrl = new URL(databaseUrl);
  const targetLabel = `${parsedUrl.hostname}/${parsedUrl.pathname.replace(/^\//, "") || "(default)"}`;

  if (process.argv.includes("--dry-run")) {
    console.log(
      `E2E seed validated for ${targetLabel}: 1 user, ${journeyProjects.length + 1} projects, ${chapterRows.length + journeyChapters.length} chapters, ${suggestionRows.length} pending suggestions. No database connection opened.`,
    );
    return;
  }

  const client = neon(databaseUrl);
  const db = drizzle(client, { schema });

  await db.batch([
    db.execute(
      sql.raw(`
        TRUNCATE TABLE
          "analytics_events",
          "assets",
          "content_tool_runs",
          "moderation_flags",
          "continuity_issues",
          "suggestions",
          "credit_ledger",
          "llm_calls",
          "generation_events",
          "generation_runs",
          "entity_relationships",
          "entities",
          "chapter_revisions",
          "chapters",
          "outlines",
          "books",
          "projects",
          "users"
        RESTART IDENTITY CASCADE
      `),
    ),
    db.insert(schema.users).values({
      id: IDS.user,
      email: "dev-author@example.invalid",
      name: "E2E Sample Author",
      role: "admin",
      suspended: false,
      acquisition: {
        source: "direct",
        medium: "e2e",
        campaign: "isolated-fixture",
        landingPath: "/",
        capturedAt: CREATED_AT.toISOString(),
      },
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    db.insert(schema.projects).values({
      id: IDS.project,
      userId: IDS.user,
      title: "The Clockmaker's Map",
      brief:
        "A hopeful speculative mystery about an apprentice clockmaker who discovers a map that can restore time stolen from her city.",
      genre: "Science Fiction",
      subgenre: "Hopeful speculative mystery",
      protagonist: "Mara Vale, an observant apprentice clockmaker",
      setting: "Bellweather, a canal city of clocks and sealed observatories",
      targetChapters: 3,
      targetWordsPerChapter: 1200,
      styleGuide: "Clear, atmospheric prose with precise sensory detail and restrained wonder.",
      settings: {
        pov: "third_limited",
        tense: "past",
        tone: "hopeful, precise, quietly wondrous",
        voiceProfile: "close observational narration",
        styleProfile: "clean speculative mystery",
        heatLevel: "none",
        violenceLevel: "mild",
        profanity: "none",
        avoidTopics: [],
        qualityTier: "standard",
        requireOutlineApproval: true,
      },
      status: "editing",
      completedAt: RUN_COMPLETED_AT,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    db.insert(schema.projects).values(journeyProjects),
    db.insert(schema.books).values({
      id: IDS.book,
      projectId: IDS.project,
      title: concept.title,
      synopsis: concept.synopsis,
      concept,
      frontMatter: {
        author: "E2E Sample Author",
        dedication: "For every first draft.",
      },
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    db.insert(schema.books).values(journeyBooks),
    db.insert(schema.outlines).values({
      id: IDS.outline,
      bookId: IDS.book,
      version: 1,
      content: outline,
      source: "ai",
      createdAt: CREATED_AT,
    }),
    db.insert(schema.outlines).values(journeyOutlines),
    db.insert(schema.chapters).values(chapterRows),
    db.insert(schema.chapters).values(journeyChapters),
    db.insert(schema.chapterRevisions).values([
      {
        id: IDS.revisions[0],
        chapterId: IDS.chapters[0],
        content:
          "# The Brass Compass\n\nMara found the compass on the workbench. It pointed toward the floor.",
        source: "workflow",
        runId: IDS.run,
        createdAt: RUN_STARTED_AT,
      },
      {
        id: IDS.revisions[1],
        chapterId: IDS.chapters[0],
        content: chapterContents[0],
        source: "user",
        runId: IDS.run,
        createdAt: UPDATED_AT,
      },
    ]),
    db.insert(schema.entities).values(
      entityFixtures.map((entity) => ({
        ...entity,
        bookId: IDS.book,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      })),
    ),
    db.insert(schema.entityRelationships).values([
      {
        id: IDS.relationships[0],
        bookId: IDS.book,
        fromEntityId: IDS.entities[0],
        toEntityId: IDS.entities[2],
        type: "owns",
        description: "Mara inherits and carries the brass compass.",
        establishedChapter: 1,
        createdAt: CREATED_AT,
      },
      {
        id: IDS.relationships[1],
        bookId: IDS.book,
        fromEntityId: IDS.entities[2],
        toEntityId: IDS.entities[1],
        type: "located-in",
        description: "The compass is first found inside Vale Clockworks.",
        establishedChapter: 1,
        createdAt: CREATED_AT,
      },
    ]),
    db.insert(schema.generationRuns).values({
      id: IDS.run,
      projectId: IDS.project,
      userId: IDS.user,
      workflowRunId: "e2e-workflow-completed",
      kind: "full_book",
      status: "completed",
      config: {
        tier: "standard",
        requireOutlineApproval: true,
        waveSize: 2,
        targetChapters: 3,
        targetWordsPerChapter: 1200,
        completion: {
          finalized: {
            sourceRunId: IDS.run,
            manuscriptDigest: "e2e-clockmakers-map-complete",
          },
        },
      },
      approvalNotes: "Keep the mystery hopeful and preserve Mara's authorship.",
      startedAt: RUN_STARTED_AT,
      completedAt: RUN_COMPLETED_AT,
      createdAt: RUN_STARTED_AT,
    }),
    db.insert(schema.generationRuns).values(journeyRuns),
    db.insert(schema.generationEvents).values(
      runEvents.map((event, index) => ({
        id: IDS.events[index],
        runId: IDS.run,
        seq: index + 1,
        type: event.type,
        payload: event,
        createdAt: new Date(RUN_STARTED_AT.getTime() + index * 60_000),
      })),
    ),
    db.insert(schema.llmCalls).values([
      {
        id: IDS.llmCalls[0],
        userId: IDS.user,
        projectId: IDS.project,
        runId: IDS.run,
        agentRole: "concept",
        operation: "generate-concept",
        model: "e2e-fixture-model",
        inputTokens: 1400,
        outputTokens: 620,
        cachedInputTokens: 200,
        reasoningTokens: 180,
        usd: "0.180000",
        latencyMs: 920,
        createdAt: RUN_STARTED_AT,
      },
      {
        id: IDS.llmCalls[1],
        userId: IDS.user,
        projectId: IDS.project,
        runId: IDS.run,
        agentRole: "outliner",
        operation: "generate-outline",
        model: "e2e-fixture-model",
        inputTokens: 2200,
        outputTokens: 1300,
        cachedInputTokens: 400,
        reasoningTokens: 320,
        usd: "0.320000",
        latencyMs: 1280,
        createdAt: new Date(RUN_STARTED_AT.getTime() + 2 * 60_000),
      },
      {
        id: IDS.llmCalls[2],
        userId: IDS.user,
        projectId: IDS.project,
        runId: IDS.run,
        agentRole: "writer",
        operation: "draft-chapters",
        model: "e2e-fixture-model",
        inputTokens: 8400,
        outputTokens: 5100,
        cachedInputTokens: 1200,
        reasoningTokens: 700,
        usd: "1.100000",
        latencyMs: 6200,
        createdAt: new Date(RUN_STARTED_AT.getTime() + 6 * 60_000),
      },
      {
        id: IDS.llmCalls[3],
        userId: IDS.user,
        projectId: IDS.project,
        runId: IDS.run,
        agentRole: "continuity",
        operation: "review-continuity",
        model: "e2e-fixture-model",
        inputTokens: 2600,
        outputTokens: 520,
        cachedInputTokens: 600,
        reasoningTokens: 240,
        usd: "0.150000",
        latencyMs: 1100,
        createdAt: new Date(RUN_STARTED_AT.getTime() + 14 * 60_000),
      },
    ]),
    db.insert(schema.creditLedger).values([
      {
        id: IDS.ledger[0],
        userId: IDS.user,
        amount: "250.0000",
        kind: "grant",
        description: "Isolated E2E fixture grant",
        externalRef: "e2e-grant-clockmakers-map",
        createdAt: CREATED_AT,
      },
      {
        id: IDS.ledger[1],
        userId: IDS.user,
        amount: "66.0000",
        kind: "purchase",
        description: "Synthetic Author pack",
        externalRef: "e2e-checkout-clockmakers-map",
        usdPaid: "60.00",
        createdAt: new Date(CREATED_AT.getTime() + 60_000),
      },
      {
        id: IDS.ledger[2],
        userId: IDS.user,
        amount: "-1.7500",
        kind: "usage",
        description: "The Clockmaker's Map generation",
        projectId: IDS.project,
        runId: IDS.run,
        externalRef: "e2e-usage-clockmakers-map",
        meteredUsd: "1.750000",
        createdAt: RUN_COMPLETED_AT,
      },
    ]),
    db.insert(schema.suggestions).values(suggestionRows),
    db.insert(schema.continuityIssues).values({
      id: IDS.continuity,
      bookId: IDS.book,
      runId: IDS.run,
      chapters: [1, 2],
      category: "timeline",
      severity: "minor",
      description:
        "The transition from dusk to the underground chamber could orient elapsed time more clearly.",
      suggestedFix: "Add one brief time cue when Mara reaches the chamber.",
      status: "open",
      createdAt: RUN_COMPLETED_AT,
    }),
    db.insert(schema.moderationFlags).values({
      id: IDS.moderation,
      projectId: IDS.project,
      chapterNumber: 2,
      source: "chapter",
      category: "e2e_fixture_review",
      severity: "review",
      excerpt: "Synthetic, policy-safe fixture used to verify the private Admin review table.",
      detail: "This record is test data and does not represent an actual content-safety finding.",
      status: "open",
      createdAt: RUN_COMPLETED_AT,
    }),
    db.insert(schema.analyticsEvents).values([
      {
        id: IDS.analytics[0],
        name: "book_started",
        userId: IDS.user,
        anonId: "e2e-anon-clockmakers-map",
        props: { projectId: IDS.project, source: "isolated-fixture" },
        createdAt: RUN_STARTED_AT,
      },
      {
        id: IDS.analytics[1],
        name: "book_completed",
        userId: IDS.user,
        anonId: "e2e-anon-clockmakers-map",
        props: { projectId: IDS.project, chapters: 3 },
        createdAt: RUN_COMPLETED_AT,
      },
    ]),
  ] as const);

  console.log(
    `Seeded isolated E2E database ${targetLabel}: 1 admin author, ${journeyProjects.length + 1} projects, ${chapterRows.length + journeyChapters.length} chapters, ${suggestionRows.length} pending suggestions.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
