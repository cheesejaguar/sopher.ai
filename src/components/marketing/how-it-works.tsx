import { PIPELINE_STEPS as STEPS } from "./content";

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-20 border-b border-black/10 dark:border-white/10"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Production sequence / 01–05</p>
          </div>
          <div className="lg:col-span-8">
            <h2
              id="how-it-works-heading"
              className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-5xl"
            >
              Five agents. One pass of ink.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
              Your brief moves through a pipeline of specialists, the way a manuscript moves through
              a publishing house — except the whole house works at once.
            </p>
          </div>
        </div>

        <ol className="mt-16 border-y border-black/10 dark:border-white/10">
          {STEPS.map((step, index) => (
            <li
              id={`pipeline-${step.name.toLowerCase()}`}
              key={step.name}
              className="grid scroll-mt-24 gap-4 border-b border-black/10 py-7 last:border-b-0 dark:border-white/10 sm:grid-cols-[4rem_12rem_1fr] sm:items-start lg:grid-cols-[5rem_17rem_1fr] lg:py-9"
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
              <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
                <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base sm:leading-7">
                  {step.description}
                </p>
                <span
                  aria-hidden="true"
                  className="relative hidden h-16 w-12 border border-paper-edge bg-paper shadow-[5px_5px_0_var(--paper-edge)] sm:block"
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
            You stay in the loop.
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
