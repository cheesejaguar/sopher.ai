import { PIPELINE_STEPS as STEPS } from "./content";

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="defer-offscreen defer-how scroll-mt-20 border-b border-black/10 dark:border-white/10"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Story journey / 01–05</p>
          </div>
          <div className="lg:col-span-8">
            <h2
              id="how-it-works-heading"
              className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-5xl"
            >
              Five stages carry your idea into a book.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
              Your premise finds its world, its shape, and finally its voice through a coordinated
              team of specialists. You can follow the work from the first outline to the final
              continuity pass.
            </p>
          </div>
        </div>

        <ol className="mt-10 border-y border-black/10 dark:border-white/10 sm:mt-16">
          {STEPS.map((step, index) => (
            <li
              id={`pipeline-${step.name.toLowerCase()}`}
              key={step.name}
              className="grid scroll-mt-24 gap-3 border-b border-black/10 py-5 last:border-b-0 dark:border-white/10 sm:gap-4 sm:py-7 min-[1200px]:grid-cols-[4rem_12rem_1fr] min-[1200px]:items-start min-[1440px]:grid-cols-[5rem_17rem_1fr] min-[1440px]:py-9"
            >
              <span className="font-mono text-xs tracking-[0.12em] text-primary sm:pt-1">
                {step.num}
              </span>
              <h3 className="font-display text-2xl font-semibold tracking-[-0.025em]">
                {step.name}
                {step.note ? (
                  <span className="mt-2 block w-fit border-l border-ion pl-2 font-mono text-[0.6875rem] font-normal tracking-[0.08em] text-ion uppercase">
                    {step.note}
                  </span>
                ) : null}
              </h3>
              <div className="grid gap-5 min-[1200px]:grid-cols-[1fr_auto] min-[1200px]:items-start">
                <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base sm:leading-7">
                  {step.description}
                </p>
                <span
                  aria-hidden="true"
                  className="marketing-page-signature relative hidden h-16 w-12 border border-paper-edge bg-paper shadow-[5px_5px_0_var(--paper-edge)] min-[1200px]:block"
                >
                  <span className="absolute top-3 right-2 left-2 h-px bg-paper-muted/35" />
                  <span className="absolute top-5 right-4 left-2 h-px bg-paper-muted/25" />
                  <span className="absolute top-8 right-2 left-2 h-px bg-paper-muted/25" />
                  <span
                    className="absolute right-2 bottom-3 left-2 h-px bg-primary/60"
                    style={{ opacity: (index + 1) / STEPS.length }}
                  />
                </span>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-8 border-l border-primary pl-5 lg:grid-cols-12 lg:pl-8">
          <h3 className="font-display text-2xl font-semibold tracking-[-0.025em] lg:col-span-4">
            You make the calls.
          </h3>
          <ul className="grid gap-px bg-black/10 dark:bg-white/10 sm:grid-cols-2 lg:col-span-8">
            {[
              "Approve or revise the outline",
              "Inspect generation as it runs",
              "Edit chapters and review suggestions",
              "Own and export the complete manuscript",
            ].map((control, index) => (
              <li
                key={control}
                className="grid min-h-20 grid-cols-[2rem_1fr] items-start bg-background p-4 text-sm leading-6"
              >
                <span className="font-mono text-[0.6875rem] text-muted-foreground">
                  C{index + 1}
                </span>
                {control}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
