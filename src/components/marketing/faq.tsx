import { FAQS } from "./content";

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
