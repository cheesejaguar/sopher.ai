import { PIPELINE_STEPS } from "@/components/marketing/content";
import { REVIEW_PHASES } from "@/ai/prompts/review-rubric";
import { CREDIT_PACKS, SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";
import { PUBLIC_TIER_COSTS } from "@/lib/billing/public-pricing";

/**
 * Guides.
 *
 * Written from what the product actually does — the pipeline steps, the review
 * rubric, the tier definitions, the real credit costs — rather than from
 * marketing intuition about it. That constraint is deliberate: a guide that
 * overstates the product is worse than no guide, because it is the page an
 * answer engine will quote when someone asks whether this can do the thing.
 *
 * Blocks are a small closed union rather than markdown, so the rendered output
 * stays inside the design system and every list is real list markup a crawler
 * can parse.
 */

export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string; id: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: { name: string; text: string }[] }
  | { kind: "note"; text: string };

export type Guide = {
  slug: string;
  title: string;
  /** Under 160 chars — the meta description. */
  description: string;
  /** One line under the h1. */
  standfirst: string;
  blocks: GuideBlock[];
  faqs?: { question: string; answer: string }[];
};

const tierGuide: Guide = {
  slug: "choosing-a-quality-tier",
  title: "Choosing a quality tier",
  description:
    "Draft, Standard, or Premium — what each one actually changes about how your book is written, and what it costs in credits.",
  standfirst: "The tier decides which models write your book and how much editing it gets.",
  blocks: [
    {
      kind: "p",
      text: "Three tiers, chosen before writing starts and recorded against the run so you can always see what a given book was written at. They differ in two ways: which model drafts the prose, and how much editorial work happens after the draft exists.",
    },
    { kind: "h2", text: "Draft", id: "draft" },
    {
      kind: "p",
      text: `A single pass. Chapters are planned, drafted, and checked with free heuristics — no model-driven critique, no revision pass. Roughly ${PUBLIC_TIER_COSTS.draft.credits} credits for a finished novella.`,
    },
    {
      kind: "p",
      text: "Use it when you want to see the shape of a book quickly, or when the story matters more to you than the sentences: a bedtime story, a gift, something you intend to rewrite yourself anyway.",
    },
    { kind: "h2", text: "Standard", id: "standard" },
    {
      kind: "p",
      text: `The default. Each chapter is drafted, then critiqued, then revised in targeted passes against the critique — changing the parts that need changing rather than regenerating wholesale. Roughly ${PUBLIC_TIER_COSTS.standard.credits} credits.`,
    },
    {
      kind: "p",
      text: "This is the right choice for most books. Plot-forward genres in particular — mystery, thriller, fantasy — get most of their value from structure and continuity, both of which Standard covers fully.",
    },
    { kind: "h2", text: "Premium", id: "premium" },
    {
      kind: "p",
      text: `The strongest available prose model for both drafting and editing, plus a deeper editorial pass. Roughly ${PUBLIC_TIER_COSTS.premium.credits} credits.`,
    },
    {
      kind: "p",
      text: "Worth it where the sentence is the product. Literary fiction is the clear case: it is the genre with nothing hidden behind plot, so the difference between a competent paragraph and a good one is the whole difference. Also worth it for anything you intend to publish.",
    },
    { kind: "h2", text: "What the difference costs", id: "cost" },
    {
      kind: "p",
      text: `The gap between the cheapest and most expensive tier is about 15 credits on a novella — roughly the price of a coffee, against a book you might reread. New accounts start with ${SIGNUP_GRANT_CREDITS} free credits, which is enough to watch a real book begin and decide for yourself.`,
    },
    {
      kind: "note",
      text: "You are shown an estimate before anything runs, and nothing is spent until you approve it. Every book comes with a report of exactly where its credits went.",
    },
  ],
  faqs: [
    {
      question: "Can I change tier after starting?",
      answer:
        "Not mid-run, but you can regenerate individual chapters at a different tier afterwards, and the tier used for each run is recorded so you can tell them apart.",
    },
    {
      question: "Is Premium worth it for genre fiction?",
      answer:
        "Usually not, with one exception: if you intend to publish it. Plot-forward genres get most of their quality from structure and continuity, which Standard covers fully.",
    },
    {
      question: "What is a credit worth?",
      answer: `One credit is one dollar of writing. Packs start at $${CREDIT_PACKS[0].usd} for ${CREDIT_PACKS[0].credits} credits, and larger packs carry a bonus.`,
    },
  ],
};

const pipelineGuide: Guide = {
  slug: "how-book-generation-works",
  title: "How book generation works",
  description:
    "Five agents, in order: concept, outline, chapters, editor, continuity. What each one does and where you can intervene.",
  standfirst:
    "Follow one idea as it becomes a concept, an outline, a draft, and finally a polished manuscript.",
  blocks: [
    {
      kind: "p",
      text: "sopher.ai is not a single prompt. It is a pipeline of specialized agents, each with its own tools and its own review, running as a durable workflow — which is why a run can pause for your approval, or for a credit top-up, and pick up exactly where it left off rather than starting over.",
    },
    { kind: "h2", text: "The five stages", id: "stages" },
    {
      kind: "steps",
      items: PIPELINE_STEPS.map((step) => ({ name: step.name, text: step.description })),
    },
    { kind: "h2", text: "Where you can intervene", id: "intervene" },
    {
      kind: "p",
      text: "The outline is the highest-leverage point. If you asked for outline approval, the run pauses after the plan is written and before any chapter is drafted, and you can send it back with notes in your own words. Changing the plan there costs almost nothing; changing the story after twenty chapters exist costs a lot.",
    },
    {
      kind: "list",
      items: [
        "Approve or revise the outline before drafting begins.",
        "Watch chapters arrive as they are written, and read them as they land.",
        "Rewrite any passage — select it, say what you want changed, accept or reject the suggestion.",
        "Ask for a full-chapter review with a focus you specify.",
        "Regenerate a whole chapter, or edit the prose directly.",
        "Export to EPUB, PDF, DOCX, or Markdown at any point.",
      ],
    },
    { kind: "h2", text: "Why chapters are written four at a time", id: "waves" },
    {
      kind: "p",
      text: "Chapters are drafted in parallel waves of four. Every writer follows the same outline, story bible, voice settings, and continuity record so the separate chapters still form one manuscript.",
    },
    {
      kind: "p",
      text: "Parallelism creates a consistency problem, which the story bible solves: every character, place, object, and organization is recorded as chapters are written, and each chapter writer reads from it. A continuity pass then checks the whole manuscript at the end, when every chapter exists and contradictions between distant chapters are actually visible.",
    },
    {
      kind: "note",
      text: "If your balance runs out mid-book, the run pauses at a chapter boundary rather than failing. Every chapter already written is kept, and adding credits resumes it.",
    },
  ],
  faqs: [
    {
      question: "Can I follow generation as it runs?",
      answer:
        "Yes. The Studio shows the active stage, drafted chapters, agent notes, credit use, approvals, and recoverable pause or failure states while the manuscript is being built.",
    },
    {
      question: "What happens if a chapter fails to generate?",
      answer:
        "The workflow is durable and retries the failed step. Work already completed is never redone, and a run that cannot recover leaves every finished chapter intact.",
    },
    {
      question: "Can I stop a run partway?",
      answer:
        "Yes. You keep everything written up to that point and are only charged for the work that actually ran.",
    },
  ],
};

const voiceGuide: Guide = {
  slug: "point-of-view-and-tense",
  title: "Point of view and tense",
  description:
    "First or third person, past or present — what each choice does to a reader, and which genres expect which.",
  standfirst: "Two settings that change the feel of a book more than any other.",
  blocks: [
    {
      kind: "p",
      text: "Point of view and tense are set before writing and held consistently across the whole manuscript. They are worth a minute of thought, because they are the two settings a reader notices without being able to name.",
    },
    { kind: "h2", text: "Point of view", id: "pov" },
    {
      kind: "p",
      text: "First person puts the reader inside one head. Everything is filtered through that character, including what they are wrong about — which is a feature, and the reason unreliable narrators exist. It creates intimacy fast and limits you to what one person can know.",
    },
    {
      kind: "p",
      text: "Third limited follows one character closely but from outside — the most common choice in modern fiction, and the most flexible. You keep most of the intimacy and gain the ability to describe the character from the outside.",
    },
    {
      kind: "p",
      text: "Third omniscient moves freely between characters and can comment on all of them. It suits large casts and long timescales, and it costs intimacy: a reader who is everywhere is nowhere in particular.",
    },
    { kind: "h2", text: "Tense", id: "tense" },
    {
      kind: "p",
      text: "Past tense is the default of storytelling and effectively invisible — readers stop noticing it by the second page. Present tense feels immediate and slightly breathless, which is why thrillers and young-adult fiction use it, and why it can become tiring across a very long book.",
    },
    { kind: "h2", text: "What each genre tends to expect", id: "conventions" },
    {
      kind: "list",
      items: [
        "Romance: first person or third limited, often alternating between both leads.",
        "Mystery: third limited on the detective, or first person for hardboiled and cozy.",
        "Fantasy: third limited is standard; omniscient for epic scope.",
        "Thriller: third limited, frequently present tense for immediacy.",
        "Literary fiction: anything, deliberately — this is where the choice is most expressive.",
        "Horror: first person or close third, because vulnerability needs proximity.",
      ],
    },
    {
      kind: "note",
      text: "These are conventions, not rules. Breaking one on purpose is a legitimate choice; breaking one by accident reads as a mistake.",
    },
  ],
  faqs: [
    {
      question: "Can I change point of view after the book is written?",
      answer:
        "Not as a global setting, but you can regenerate chapters or rewrite passages. Changing POV across a finished manuscript is effectively a rewrite, so it is worth getting right up front.",
    },
    {
      question: "Which should I pick if I am unsure?",
      answer: "Third limited, past tense. It is the modern default and it fits almost anything.",
    },
  ],
};

const contentGuide: Guide = {
  slug: "content-settings",
  title: "Heat, violence, and profanity",
  description:
    "Three settings that control how explicit your book gets, applied consistently across every chapter.",
  standfirst: "You decide the content level. It holds for the whole manuscript.",
  blocks: [
    {
      kind: "p",
      text: "Three independent settings, each with four levels. They are chosen before writing and applied consistently — which matters, because the usual failure of AI-written fiction is drifting between chapters: chaste in chapter three, unexpectedly graphic in chapter eleven.",
    },
    { kind: "h2", text: "Heat", id: "heat" },
    {
      kind: "p",
      text: "None keeps romance emotional and closes the door. Mild allows kissing and attraction. Moderate allows sensuality and implied intimacy. Explicit writes the scenes.",
    },
    { kind: "h2", text: "Violence", id: "violence" },
    {
      kind: "p",
      text: "None avoids it. Mild allows conflict and consequence without dwelling. Moderate allows injury and death on the page. Graphic does not look away.",
    },
    { kind: "h2", text: "Profanity", id: "profanity" },
    {
      kind: "p",
      text: "None through strong, controlling how characters actually speak. Worth setting deliberately rather than by default — dialogue that is cleaner than the character would be reads as false.",
    },
    { kind: "h2", text: "What is not adjustable", id: "limits" },
    {
      kind: "p",
      text: "A small set of categories is refused regardless of settings: sexual content involving minors, non-consensual content presented approvingly, incitement to real-world violence or hatred, sexual or defamatory content about real identifiable people, and instructions for self-harm. These are not a heat level; they are a line.",
    },
    {
      kind: "note",
      text: "Everything else is yours to set. An adult writing explicit fiction for adults is the product working as intended, not an edge case being tolerated.",
    },
  ],
  faqs: [
    {
      question: "Can I write explicit fiction?",
      answer:
        "Yes. Set heat to explicit and the scenes are written. The setting applies consistently across the whole book.",
    },
    {
      question: "Can I ask it to avoid specific topics?",
      answer:
        "Yes — an avoid-topics list is part of a project's settings and is carried into every chapter.",
    },
    {
      question: "Are my settings visible to anyone else?",
      answer:
        "Your work is private to your account. We may review content when required to enforce our terms or comply with law, which is disclosed in the privacy policy.",
    },
  ],
};

const editorialGuide: Guide = {
  slug: "what-the-editorial-pass-checks",
  title: "What the editorial pass checks",
  description:
    "Six weighted dimensions the manuscript is reviewed against after the chapters exist — and what happens to what it finds.",
  standfirst: "The draft is not the deliverable. This is what happens to it afterwards.",
  blocks: [
    {
      kind: "p",
      text: "Once chapters exist, the manuscript is reviewed against a weighted rubric. This is a separate stage from drafting on purpose: a writer in the middle of chapter twelve cannot see that chapter four undercut its own ending, and asking one agent to do both jobs produces prose that is defensive rather than good.",
    },
    { kind: "h2", text: "The six dimensions", id: "dimensions" },
    {
      kind: "steps",
      items: REVIEW_PHASES.map((phase) => ({
        name: `${phase.name} (${Math.round(phase.weight * 100)}%)`,
        text: phase.description,
      })),
    },
    { kind: "h2", text: "What happens to what it finds", id: "outcome" },
    {
      kind: "p",
      text: "Findings are chapter-scoped, so a revision changes the chapter that has the problem rather than regenerating the book. Revisions are bounded — the pipeline does not loop indefinitely trying to satisfy its own critic, which is a failure mode that burns credits without improving prose.",
    },
    {
      kind: "p",
      text: "Continuity is handled separately, at the end, across the whole manuscript. That is when contradictions between distant chapters are actually detectable: a name that changed spelling, a journey that takes different lengths of time in each direction, an object a character should not still have.",
    },
    { kind: "h2", text: "What you can do yourself", id: "yours" },
    {
      kind: "list",
      items: [
        "Ask for a full-chapter review with a focus you name — pacing, dialogue, a specific character.",
        "Select any passage and describe the change you want in your own words.",
        "Accept or reject each suggestion individually; nothing is applied without you.",
        "Regenerate a chapter from the outline.",
        "Edit the prose directly. It is your manuscript.",
      ],
    },
  ],
  faqs: [
    {
      question: "Does the editorial pass rewrite everything?",
      answer:
        "No. Revisions are targeted at the specific issues found, and bounded — it will not loop indefinitely trying to satisfy its own critique.",
    },
    {
      question: "Which tiers include it?",
      answer:
        "Standard and Premium. Draft is a single pass with free heuristic checks and no model-driven critique.",
    },
    {
      question: "Can I see what it found?",
      answer:
        "Yes. Suggestions appear in the studio editor with the reasoning attached, and you accept or reject each one.",
    },
  ],
};

export const GUIDES: Guide[] = [pipelineGuide, tierGuide, voiceGuide, contentGuide, editorialGuide];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
