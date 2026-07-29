/**
 * Marketing copy that more than one surface needs: the visible components and
 * the JSON-LD that describes them to search engines and answer engines.
 *
 * Kept in one place deliberately. Structured data that drifts from the page it
 * annotates is worse than no structured data — Google treats the mismatch as a
 * spam signal, and an answer engine will happily quote the stale copy.
 */

export type FaqItem = { question: string; answer: string };

export const FAQS: FaqItem[] = [
  {
    question: "How long does a book take?",
    answer:
      "Usually under an hour. Chapter writers work in parallel, so a thirty-chapter novel doesn't take thirty times longer than one chapter.",
  },
  {
    question: "Do I own the manuscript?",
    answer:
      "Yes. Your brief, your book. Export the finished manuscript and publish it wherever you like.",
  },
  {
    question: "What if I don't like the result?",
    answer:
      "Open it in the studio editor. Ask for rewrites chapter by chapter, accept or reject each suggestion, or regenerate from the outline with revised notes.",
  },
  {
    question: "What exactly am I paying for?",
    answer:
      "Credits, spent only on work that actually runs — the models that draft, edit, and check your book. One credit is one dollar of writing; a finished novella runs about 21–36 credits, and every book includes a report of where they went.",
  },
];

export type PipelineStep = {
  num: string;
  name: string;
  note?: string;
  description: string;
};

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    num: "01",
    name: "Concept",
    description:
      "Reads your brief and develops the premise, world, and cast into a concept worth writing.",
  },
  {
    num: "02",
    name: "Outline",
    description:
      "Structures the story into a chapter-by-chapter plan with arcs, beats, and payoffs.",
  },
  {
    num: "03",
    name: "Chapters",
    note: "four at a time",
    description:
      "A team of writers drafts every chapter in parallel, each following the outline and your style guide.",
  },
  {
    num: "04",
    name: "Editor",
    description: "Critiques and rewrites each chapter for pacing, voice, and prose quality.",
  },
  {
    num: "05",
    name: "Continuity",
    description:
      "Checks names, timelines, and details across the whole manuscript before it ships.",
  },
];
