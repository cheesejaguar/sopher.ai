import { FAQS } from "./content";

export function Faq() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="border-b border-black/10 dark:border-white/10"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-24 lg:grid-cols-12 lg:px-8 lg:py-32">
        <div className="lg:col-span-4">
          <p className="folio-label text-primary">Reference / direct answers</p>
          <h2
            id="faq-heading"
            className="mt-5 font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
          >
            Common questions
          </h2>
        </div>
        <dl className="border-t border-black/10 dark:border-white/10 lg:col-span-8">
          {FAQS.map((item) => (
            <div
              key={item.question}
              className="grid gap-3 border-b border-black/10 py-6 dark:border-white/10 sm:grid-cols-[minmax(10rem,0.8fr)_1.2fr] sm:gap-8"
            >
              <dt className="font-display font-semibold tracking-[-0.015em]">{item.question}</dt>
              <dd className="text-sm leading-6 text-pretty text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
