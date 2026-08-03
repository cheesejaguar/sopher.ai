type Sample = {
  value: string;
  genre: string;
  title: string;
  paragraphs: string[];
};

const SAMPLES: Sample[] = [
  {
    value: "fantasy",
    genre: "Fantasy",
    title: "The Ninth Door",
    paragraphs: [
      "The mountain had a door, and the door had been shut for nine hundred years. Maren stood before it in the blue hour with her grandmother's key warming in her fist, listening to the wind comb through the pass behind her. The key had no business existing. The door had no business having a lock. Yet here they both were, iron and iron, patient as winter.",
      "“You could still turn back,” said Corvo, who had said this at the village, at the bridge, and at the treeline, and who was still following her anyway.",
      "Maren fit the key to the lock. Inside the mountain, faint as a heartbeat under a floorboard, the bells began to ring.",
    ],
  },
  {
    value: "mystery",
    genre: "Mystery",
    title: "Low Water",
    paragraphs: [
      "The tide went out at six and left the body behind like an apology. By seven, half of Harwick Point stood on the seawall pretending not to look, and Inspector Dara Quill crouched on the wet shingle, looking properly.",
      "No wallet. No watch. City shoes ruined by salt water — a man who had walked nowhere in years, delivered to a town you had to want to reach. She noted the hands: soft palms, one broken nail, a pale band where a ring had lived a long time and recently left.",
      "“Drowned?” asked the constable, hopeful, because drowned was simple.",
      "“Drowned men come in with the tide,” Quill said. “This one was waiting for it.”",
    ],
  },
  {
    value: "romance",
    genre: "Romance",
    title: "Marginalia",
    paragraphs: [
      "Nora had rules about the bakery, and rule one was that nobody touched the marginalia table — the wobbling stack of secondhand novels she lent out with coffee and took back with crumbs. So when the new tenant from upstairs walked in out of the rain, picked up her battered copy of Persuasion, and read her own penciled note aloud — he means it, he has always meant it — she was annoyed before she noticed his hands were shaking with cold.",
      "“Sorry,” he said, not putting the book down. “Whoever wrote this argues in the margins like they're losing.”",
      "“She isn't losing,” Nora said.",
      "He looked up and smiled like an apology. “Then I'd like to hear her side.”",
    ],
  },
];

export function SampleOutput() {
  return (
    <section
      aria-labelledby="sample-output-heading"
      className="defer-offscreen defer-samples border-b border-black/10 dark:border-white/10"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:gap-10 sm:px-6 sm:py-24 lg:grid-cols-12 lg:px-8 lg:py-32">
        <div className="lg:col-span-4">
          <p className="folio-label text-primary">Proof 02 / sample output</p>
          <h2
            id="sample-output-heading"
            className="mt-5 font-display text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-balance"
          >
            Judge the prose first
          </h2>
          <p className="mt-5 max-w-sm leading-7 text-muted-foreground">
            Illustrative opening pages from three labeled sample briefs, shown so you can judge
            voice, pacing, and control of detail.
          </p>
          <div className="mt-8 hidden border-t border-black/10 pt-4 font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase dark:border-white/10 lg:block">
            Manuscript view / chapter 01
          </div>
        </div>

        <div className="min-w-0 lg:col-span-8">
          {SAMPLES.map((sample, index) => (
            <details
              key={sample.value}
              name="sample-genre"
              open={index === 0}
              className="group border-b border-black/10 first:border-t dark:border-white/10"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span>{sample.genre}</span>
                <span
                  aria-hidden="true"
                  className="font-mono text-base text-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <article className="manuscript-sheet mb-6 px-4 py-8 min-[360px]:px-6 sm:px-12 sm:py-14">
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-8 h-6 w-20 bg-primary/75"
                />
                <div className="mx-auto max-w-[68ch]">
                  <p className="font-sans text-[0.6875rem] font-medium tracking-[0.18em] text-paper-muted uppercase">
                    {sample.title} · Chapter one
                  </p>
                  <div className="prose-manuscript prose-manuscript--book mt-5">
                    {sample.paragraphs.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                    ))}
                  </div>
                  <p className="mt-10 flex items-center justify-between border-t border-paper-edge pt-4 font-sans text-xs text-paper-muted">
                    <span>{sample.genre} · chapter 1 excerpt</span>
                    <span className="font-mono">01</span>
                  </p>
                </div>
              </article>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
