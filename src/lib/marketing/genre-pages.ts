import { GENRE_IDS, GENRE_TEMPLATES, type GenreId } from "@/ai/knowledge/genres";

/**
 * Public genre pages.
 *
 * The craft knowledge — core elements, reader expectations, tropes, pacing —
 * comes from `src/ai/knowledge/genres.ts`, the same templates the outliner
 * actually uses. That is the point: the page describes what the product will
 * genuinely do, so it cannot drift into marketing that overpromises.
 *
 * What lives here instead is the reader-facing framing: a headline, an
 * opening paragraph, and a genre-specific FAQ. The templates are written for a
 * model, in imperatives and percentages; a person arriving from a search
 * result needs prose.
 */

export type GenrePageContent = {
  /** Page h1. Reads as a thing a person would search for. */
  heading: string;
  /** Under 160 chars — this is the meta description. */
  metaDescription: string;
  /** Two or three paragraphs of real copy. */
  intro: string[];
  faqs: { question: string; answer: string }[];
};

const CONTENT: Record<GenreId, GenrePageContent> = {
  romance: {
    heading: "Write a romance novel",
    metaDescription:
      "Describe the couple and the thing keeping them apart. sopher.ai plans the beats, writes every chapter, and edits the manuscript — usually in under an hour.",
    intro: [
      "Romance is the most structurally demanding popular genre, which is exactly why it suits a planned pipeline. Readers arrive knowing the couple will end up together; the pleasure is entirely in how the book earns it. A romance that skips the black moment, or resolves its conflict with a misunderstanding that a single conversation would have fixed, fails no matter how good the prose is.",
      "So the outline is written first, with the beats placed where they belong — the meet-cute in the opening tenth, the first real intimacy around the third, the black moment late enough to hurt. Then the chapters are drafted against that plan rather than improvised forward, which is what stops the middle from sagging.",
      "You control heat level explicitly, from none to explicit, and it applies consistently across the whole book rather than drifting chapter to chapter.",
    ],
    faqs: [
      {
        question: "Can I choose how explicit the romance is?",
        answer:
          "Yes. Heat level is a setting from none through mild, moderate, and explicit, chosen before writing starts and applied consistently across every chapter.",
      },
      {
        question: "Will it give me a happy ending?",
        answer:
          "Yes. A satisfying, optimistic ending for the couple — HEA or HFN — is treated as a required element of the genre, not an option.",
      },
      {
        question: "Can I write a specific subgenre?",
        answer:
          "Yes. Pick from contemporary, historical, paranormal, romantic suspense, romantic comedy, fantasy romance, and more, and the structural guidance adapts to it.",
      },
    ],
  },
  mystery: {
    heading: "Write a mystery novel",
    metaDescription:
      "A mystery only works if the clues are placed before the reveal. sopher.ai outlines the whole case first, then writes the chapters against it.",
    intro: [
      "A mystery is the genre most obviously broken by improvisation. If the detective solves the case with a fact the reader never saw, the ending is worthless — and a writer discovering the solution as they go will do exactly that. Fair play is a structural property, not a stylistic one.",
      "That is why the case is outlined completely before a word of prose is drafted: who did it, why, what evidence exists, where each clue is planted, and which red herrings misdirect without cheating. Chapters are then written against that plan, so every clue the detective uses in the final chapter is already on the page.",
      "Continuity is checked across the whole manuscript afterwards, which in a mystery means the timeline actually holds and no witness contradicts themselves between chapter four and chapter nineteen.",
    ],
    faqs: [
      {
        question: "Will the mystery actually be solvable?",
        answer:
          "That is the intent of outlining the case before drafting. Clues are placed ahead of the revelation rather than invented at it, so the reader has what they need to solve it.",
      },
      {
        question: "Can I decide who the culprit is?",
        answer:
          "Yes. Anything you put in the brief shapes the outline, including the culprit, the motive, or the twist you want. You can also revise the outline before any chapter is written.",
      },
      {
        question: "Does it handle cozy mysteries and hardboiled equally?",
        answer:
          "Both, along with police procedural, amateur sleuth, historical, and locked-room. The structure holds; the tone, violence level, and voice change with your settings.",
      },
    ],
  },
  fantasy: {
    heading: "Write a fantasy novel",
    metaDescription:
      "Fantasy lives or dies on a magic system with rules that hold. sopher.ai builds the world, tracks it in a story bible, and checks it across every chapter.",
    intro: [
      "The failure mode of fantasy is not bad prose, it is a world that quietly contradicts itself: magic that costs something in chapter two and nothing in chapter fifteen, a journey that takes a week in one direction and an afternoon back, a character whose sword grows a jewel it never had.",
      "So the world is not held in a prompt and hoped for. Characters, places, objects, and organizations are written into a structured story bible as the book is drafted, and every chapter writer reads from it. A continuity pass then checks names, timelines, and details across the entire manuscript before you see it.",
      "Magic system rules and their costs are established early and treated as constraints for the rest of the book, because a magic system without limits removes the tension it was supposed to create.",
    ],
    faqs: [
      {
        question: "How does it keep a long fantasy novel consistent?",
        answer:
          "Every entity — character, location, object, organization — is recorded in a story bible as chapters are written, and a continuity pass checks the finished manuscript for contradictions in names, timelines, and details.",
      },
      {
        question: "Can I define my own magic system?",
        answer:
          "Yes. Put it in the brief and it becomes part of the concept and the outline, with its rules and costs carried into every chapter.",
      },
      {
        question: "Can it write epic fantasy at full length?",
        answer:
          "Up to 60 chapters. Chapters are drafted four at a time, so a long book does not take proportionally longer than a short one.",
      },
    ],
  },
  thriller: {
    heading: "Write a thriller",
    metaDescription:
      "A thriller has to escalate. sopher.ai plans the tension curve across the whole book, then drafts and edits every chapter against it.",
    intro: [
      "Thrillers are a pacing problem before they are anything else. Tension has to rise across the whole book, not oscillate — and the most common failure is a strong opening followed by a middle where the stakes quietly plateau while the plot moves sideways.",
      "Planning the escalation across all chapters before drafting is what prevents that. Each chapter knows where it sits on the curve, what has to be worse than the chapter before, and what the reader should be afraid of by the end of it.",
      "An editorial pass then goes back over every chapter for pacing specifically — sentence rhythm, scene length, where a chapter should end to make the next one unputdownable.",
    ],
    faqs: [
      {
        question: "How does it stop the middle from sagging?",
        answer:
          "The tension curve is planned across the whole book before drafting, so every chapter has a defined position on it, and an editorial pass revisits pacing after the chapters exist.",
      },
      {
        question: "Can I control how violent it gets?",
        answer:
          "Yes. Violence level is a setting from none through graphic, applied consistently across the manuscript.",
      },
      {
        question: "What thriller subgenres does it handle?",
        answer:
          "Psychological, legal, medical, techno, spy, domestic, and political thrillers, each with its own structural expectations.",
      },
    ],
  },
  literary_fiction: {
    heading: "Write literary fiction",
    metaDescription:
      "Literary fiction is judged on the sentence. sopher.ai drafts with the strongest prose model available and then critiques and revises every chapter.",
    intro: [
      "Literary fiction is the hardest thing to generate well, because it is the genre where nothing is hidden behind plot. A thriller can carry a flat paragraph; a literary novel cannot. The whole value is in the prose and the interiority.",
      "Which is why the pipeline does not just draft. Every chapter is critiqued against a review rubric — voice, specificity, whether the imagery is doing work or decorating — and then revised in targeted passes rather than rewritten wholesale. The premium tier uses the strongest available prose model for both drafting and editing.",
      "Theme is treated as something that emerges from character choices rather than something announced, and the outline is built around the interior arc rather than the sequence of external events.",
    ],
    faqs: [
      {
        question: "Which tier should I use for literary fiction?",
        answer:
          "Premium. It uses the strongest prose model for both drafting and the editorial pass, which matters more here than in any other genre — roughly 36 credits for a finished novella against 21 for a draft-tier one.",
      },
      {
        question: "Can I control the voice?",
        answer:
          "Yes. Point of view, tense, tone, and a voice preset are all set before writing, and you can add a style guide in your own words that every chapter writer follows.",
      },
      {
        question: "Can I rewrite passages myself?",
        answer:
          "Yes. The studio editor lets you rewrite any selection, ask for a targeted change in your own words, accept or reject each suggestion, or edit the prose directly.",
      },
    ],
  },
  science_fiction: {
    heading: "Write a science fiction novel",
    metaDescription:
      "Science fiction has to follow its own premise all the way through. sopher.ai works out the implications first, then writes the book that follows from them.",
    intro: [
      "Good science fiction is an argument. You change one thing about the world and then follow the consequences honestly, including the ones that are inconvenient for the plot. The weak version invents a premise, admires it in chapter one, and then tells a story that would have worked without it.",
      "The concept stage exists to do that work: establishing the speculative premise, its rules, and what it actually changes about how people live, before any chapter is drafted. The outline is then built so the premise drives the story rather than decorating it.",
      "Because the world's rules are recorded and carried forward, the technology behaves the same way in the last act as it did in the first — which is the specific consistency science fiction readers notice.",
    ],
    faqs: [
      {
        question: "Can it handle hard science fiction?",
        answer:
          "Yes, along with space opera, cyberpunk, dystopian, first contact, time travel, and post-apocalyptic. The rigour of the premise is set by your brief.",
      },
      {
        question: "Will the technology stay consistent?",
        answer:
          "The premise and its rules are established in the concept stage, recorded in the story bible, and checked across the finished manuscript by a continuity pass.",
      },
      {
        question: "Can I write a sequel in the same universe?",
        answer:
          "Describe the world in your brief and it becomes the foundation for the new book. Each book is its own project with its own story bible.",
      },
    ],
  },
  horror: {
    heading: "Write a horror novel",
    metaDescription:
      "Horror is dread, built slowly and paid off precisely. sopher.ai plans the escalation, writes the atmosphere, and keeps the rules of the threat consistent.",
    intro: [
      "Horror fails when it shows too much too early. Dread is cumulative — it depends on the reader being made to wait, on the threat having rules they slowly work out, and on the protagonist being genuinely vulnerable rather than plot-armoured.",
      "Escalation is therefore planned across the whole book before drafting: what is glimpsed, what is confirmed, and what is finally seen, in that order. Atmosphere gets explicit attention in the editorial pass, because horror is one of the few genres where sentence rhythm is doing structural work.",
      "The threat's rules are recorded and held to. A monster that can be anywhere is not frightening; a monster that can only reach you under specific conditions is, and only if those conditions never quietly change.",
    ],
    faqs: [
      {
        question: "How graphic will it be?",
        answer:
          "As graphic as you set. Violence level runs from none through graphic, and it is applied consistently rather than drifting between chapters.",
      },
      {
        question: "Can it write quiet horror rather than gore?",
        answer:
          "Yes — that is largely a matter of the violence setting, tone, and what you ask for in the brief. Gothic and psychological horror are both supported subgenres.",
      },
      {
        question: "Does the threat stay consistent?",
        answer:
          "Its rules are recorded in the story bible as the book is written and checked across the finished manuscript, which is what stops the horror deflating.",
      },
    ],
  },
};

export type GenrePage = GenrePageContent & {
  id: GenreId;
  slug: string;
  name: string;
  description: string;
  /** Reader-facing craft elements, from the templates the outliner uses. */
  coreElements: { name: string; description: string; whenToInclude: string }[];
  readerExpectations: readonly string[];
  commonTropes: readonly string[];
  subgenres: readonly string[];
  pacingNotes: string;
};

/** Slugs are hyphenated; the stored genre ids use underscores. */
export const genreSlug = (id: GenreId): string => id.replace(/_/g, "-");

export const GENRE_PAGES: GenrePage[] = GENRE_IDS.map((id) => {
  const template = GENRE_TEMPLATES[id];
  return {
    id,
    slug: genreSlug(id),
    name: template.genre,
    description: template.description,
    coreElements: template.coreElements.map((element) => ({
      name: element.name,
      description: element.description,
      whenToInclude: element.whenToInclude,
    })),
    readerExpectations: template.readerExpectations,
    commonTropes: template.commonTropes,
    subgenres: template.subgenres,
    pacingNotes: template.pacingNotes,
    ...CONTENT[id],
  };
});

export function getGenrePage(slug: string): GenrePage | undefined {
  return GENRE_PAGES.find((page) => page.slug === slug);
}
