type Example = {
  id: string;
  kind: string;
  title: string;
  brief: string;
  opening: string;
};

/** Three briefs a publisher would never print — which is the whole point. */
const EXAMPLES: Example[] = [
  {
    id: "bedtime",
    kind: "Bedtime story",
    title: "Biscuit Saves Trash Day",
    brief:
      "A bedtime story for Maya, age 6 — our beagle Biscuit gets superpowers, but only on trash day.",
    opening:
      "Biscuit was an ordinary beagle six days a week. But on Tuesday mornings, when the trash truck groaned down Alder Street, his ears went stiff as sails, his nose went hot as a kettle, and his short brown legs filled up with a feeling he could only call zoom.",
  },
  {
    id: "mystery",
    kind: "Mystery",
    title: "Nine Panes",
    brief: "A locked-room mystery set in my hometown, with a tired harbor pilot as the detective.",
    opening:
      "The door had been bolted from the inside, which was the first impossible thing. Cass Renner had steered freighters through worse fog than the story she was being told, so she set down her cold coffee and counted the window panes. Nine. Every one painted shut, for years.",
  },
  {
    id: "memoir",
    kind: "Family memoir",
    title: "Dear Ruth",
    brief:
      "My grandfather's year on a fishing trawler in 1961, written from the letters he mailed home.",
    opening:
      "He wrote to her every Sunday, whether or not there was a port to mail from, and the letters stacked up in the wheelhouse like a debt he meant to pay all at once. Dear Ruth, each one began. The sea today was the color of our kitchen floor.",
  },
];

export function BriefDemo() {
  return (
    <div role="group" aria-labelledby="brief-demo-label" className="grid w-full gap-3">
      <span className="sr-only" id="brief-demo-label">
        Example books, each written from a one-sentence brief
      </span>
      {EXAMPLES.map((example, index) => (
        <details
          key={example.id}
          name="brief-example"
          open={index === 0}
          className="group border-y border-black/10 bg-instrument/55 dark:border-white/10"
        >
          <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring dark:hover:bg-white/[0.045] sm:px-4 [&::-webkit-details-marker]:hidden">
            <span className="font-mono text-[0.6875rem] text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold tracking-[0.08em] uppercase">
                {example.kind}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {example.title}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="font-mono text-base text-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>

          <div className="grid gap-5 border-t border-black/10 p-3 dark:border-white/10 sm:p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
            <div className="min-w-0 text-left">
              <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
                The brief
              </p>
              <p className="mt-2 text-sm leading-6 text-pretty text-foreground/85">
                &ldquo;{example.brief}&rdquo;
              </p>
            </div>

            <article className="manuscript-sheet min-w-0 px-4 py-8 text-left min-[360px]:px-6 sm:px-10 sm:py-10">
              <div className="absolute top-0 right-6 h-5 w-16 bg-primary/80" aria-hidden="true" />
              <p className="font-sans text-[0.6875rem] font-medium tracking-[0.16em] text-paper-muted uppercase">
                {example.title} · Chapter one
              </p>
              <p className="prose-manuscript mt-5">{example.opening}</p>
            </article>
          </div>
        </details>
      ))}
    </div>
  );
}
