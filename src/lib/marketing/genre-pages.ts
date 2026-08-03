import { GENRE_IDS, GENRE_TEMPLATES, type GenreId } from "@/ai/knowledge/genres";
import { PUBLIC_TIER_COSTS } from "@/lib/billing/public-pricing";

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
      "Describe the couple and the thing keeping them apart. sopher.ai plans the beats, writes every chapter, and edits the complete manuscript.",
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
          "Up to 60 chapters. The shared outline and story bible keep long manuscripts coordinated across every drafting wave.",
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
        answer: `Premium. It uses the strongest prose model for both drafting and the editorial pass, which matters more here than in any other genre — roughly ${PUBLIC_TIER_COSTS.premium.credits} credits for a finished novella against ${PUBLIC_TIER_COSTS.draft.credits} for a draft-tier one.`,
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
  historical_fiction: {
    heading: "Write a historical novel",
    metaDescription:
      "Set a story in a real past without writing modern people in costume. sopher.ai anchors the period, then writes and edits the whole manuscript.",
    intro: [
      "Historical fiction fails in a specific, recognizable way: a character who thinks, speaks, and wants exactly like someone alive today, wearing period clothes. What makes the form work is constraint — the era decides what a person is permitted to do, and the drama comes from pressing against that.",
      "So the period is pinned down before drafting begins: a named place, a narrow span of time, and the rules of law, class, work, and custom that hold there. The outline then places the private story inside the public event rather than beside it, and chapters are drafted against that plan so research arrives as texture — food, money, weather, work — instead of as explanation.",
      "Continuity review afterwards checks the things period fiction most often gets wrong across a long manuscript: dates, ages, travel times, and whether a detail established in chapter three still holds in chapter twenty.",
    ],
    faqs: [
      {
        question: "How accurate will the history be?",
        answer:
          "Load-bearing details are treated as constraints rather than decoration. It is still fiction, and you should verify anything that matters to you — an author's note distinguishing fact from invention is a supported part of the book's front matter.",
      },
      {
        question: "Can I write about a real historical figure?",
        answer:
          "Yes, though the genre works best with invented characters at the center and real figures at the edges. Say what you want in the brief and the outline will follow it.",
      },
      {
        question: "Will it avoid anachronisms?",
        answer:
          "The genre guidance explicitly rules out modern idiom, anachronistic metaphor, and phonetic dialect spelling, and the editorial pass looks for them. It is worth reading for the ones that slip through.",
      },
    ],
  },
  young_adult: {
    heading: "Write a young adult novel",
    metaDescription:
      "YA lives on voice and real consequences. sopher.ai plans the arc, drafts every chapter in a close first-person voice, and edits the result.",
    intro: [
      "Young adult is defined less by subject than by proximity. The voice sits directly inside the protagonist's head, the peer world carries the weight that adults carry elsewhere, and the consequences are allowed to be permanent — which is the line that separates it from middle grade.",
      "The structure is built around two anchors: a moment of genuine autonomy near the middle, where the protagonist makes a decision nobody sanctioned, and a real cost late on that does not get undone. The outline places both before drafting, so the book earns its ending instead of arriving at one.",
      "You set the content boundaries yourself — heat, violence, and profanity are all explicit settings — and they hold consistently across the manuscript rather than drifting from chapter to chapter.",
    ],
    faqs: [
      {
        question: "Is the content appropriate for teenage readers?",
        answer:
          "That is under your control. Heat, violence, and profanity are separate settings you choose before writing, and they are applied consistently. Review the result yourself before sharing it with a young reader.",
      },
      {
        question: "Will it write in first person and present tense?",
        answer:
          "Yes. Point of view and tense are both settings, and close first person — common in YA — is fully supported.",
      },
      {
        question: "Can the ending be sad?",
        answer:
          "Yes. The genre guidance treats permanent consequence as a structural feature, while keeping a visible way forward. Say what you want the ending to feel like in your brief.",
      },
    ],
  },
  middle_grade: {
    heading: "Write a middle grade novel",
    metaDescription:
      "A book for eight to twelve year olds, with a hero their own age and a quest they can follow. sopher.ai outlines, writes, and edits the whole thing.",
    intro: [
      "Middle grade is written for readers roughly eight to twelve, and the rules are firm: the young protagonist solves the problem themselves, adults are well-meaning but absent when it counts, and the ending is hopeful. Friendship, not romance, is the emotional engine.",
      "Because chapters are short and end on pulls, structure matters more than it does at longer lengths — something has to change every chapter. The outline places the quest, the friendship rupture, and the earned climax, and the drafting keeps interiority tethered to action, which is what holds this reader.",
      "Chapter length defaults to a middle-grade scale rather than an adult one, so the finished book is the size a young reader can actually finish.",
    ],
    faqs: [
      {
        question: "How long will the finished book be?",
        answer:
          "Middle grade defaults to shorter chapters than adult fiction — around 1,600 words — and you can adjust both chapter count and length before writing begins. You see the estimate first.",
      },
      {
        question: "Will the content stay age-appropriate?",
        answer:
          "The genre guidance rules out graphic violence, on-page cruelty, and romance beyond a first crush, and the content settings are yours to set. As with any generated book, read it before handing it to a child.",
      },
      {
        question: "Can my child be the main character?",
        answer:
          "Yes. Put their name, their age, and what they are like in the brief, and the outline and story bible will build the book around them.",
      },
    ],
  },
  childrens: {
    heading: "Write a children's book",
    metaDescription:
      "A short chapter book for a child you know, built on one problem and a warm ending. sopher.ai plans it, writes it, and gives you a book to read aloud.",
    intro: [
      "A children's chapter book is the shortest thing sopher.ai writes and in some ways the most exacting. One clear problem, a hero the child's own age who fixes it themselves, a repeated phrase to hold onto, and an ending that is completely safe — with no room anywhere for a wasted paragraph.",
      "Chapters run to roughly five minutes read aloud, which is the real unit of design. Each one is a single scene with a single event, ending on a small pull rather than genuine peril, because this is a book that gets read at bedtime.",
      "Name the child it is for in your brief and the book will be built around them — their name, their dog, their street, the thing they are worried about this week.",
    ],
    faqs: [
      {
        question: "Can I write it for a specific child?",
        answer:
          "That is the intended use. Put their name, age, and the details of their world in the brief, and the story is built around them.",
      },
      {
        question: "Is it illustrated?",
        answer:
          "Not as a picture book. You can generate a cover, and the editor can add illustrations to individual passages, but the form here is a short chapter book rather than an illustrated picture book.",
      },
      {
        question: "How long does it take and what does it cost?",
        answer:
          "Because a children's book is a fraction of the length of a novel, it is the fastest and cheapest thing to produce. You get a project-specific estimate before anything runs.",
      },
    ],
  },
  memoir: {
    heading: "Write your memoir",
    metaDescription:
      "Tell a true story from your own life. sopher.ai helps shape it into chapters, drafts them in your voice, and edits the complete manuscript.",
    intro: [
      "Memoir is the one non-fiction form here, and it works differently from everything else. There is no invented cast and no plotted arc. What supplies the forward pull is a question you are genuinely trying to answer, and what makes it readable is scene — remembered life dramatized rather than summarized.",
      "The most common mistake is scope. A memoir is one bounded thread of a life, not the whole of it; a year, an illness, a marriage, a move. Structure is built around meaning rather than chronology, so chapters are free to move in time as long as the reader is oriented in the first lines.",
      "Because the people in it are real, the guidance treats them as people rather than devices — including the ones who hurt you — and expects the narrator to be at fault somewhere. That honesty is what earns a reader's trust for the harder passages.",
    ],
    faqs: [
      {
        question: "How does it know what happened to me?",
        answer:
          "From what you tell it. The brief is where you put the events, the people, and the period; the more specific you are, the more the book is genuinely yours. You can also revise the outline before any chapter is drafted.",
      },
      {
        question: "Will it invent things that did not happen?",
        answer:
          "It is instructed not to, and the genre guidance explicitly rules out inventing events or presenting composite scenes as literal fact. This is your account, so read it closely and correct anything that is not true — the editor is built for exactly that.",
      },
      {
        question: "What about the privacy of people in my story?",
        answer:
          "You decide. Consider changing identifying details for private individuals, and say so in the brief if you want that done. The book is yours; nothing is published unless you publish it.",
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
