type FaqItem = {
  question: string;
  answer: string;
};

const FAQS: FaqItem[] = [
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
      "Credits, spent only on work that actually runs — the models that draft, edit, and check your book. One credit is one dollar of writing; a finished novella runs about 21\u201336 credits, and every book includes a report of where they went.",
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-heading">
      <div className="mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-32">
        <h2
          id="faq-heading"
          className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Common questions
        </h2>
        <dl className="mt-8 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {FAQS.map((item) => (
            <div key={item.question}>
              <dt className="font-medium">{item.question}</dt>
              <dd className="mt-2 text-sm text-pretty text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
