import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <section aria-labelledby="sample-output-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Sample output</p>
          <h2
            id="sample-output-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Judge the prose first
          </h2>
          <p className="mt-4 text-muted-foreground">
            Opening pages from three briefs, exactly as the agents delivered them — drafted, edited,
            and continuity-checked.
          </p>
        </div>

        <Tabs defaultValue="fantasy" className="mt-10">
          <TabsList aria-label="Sample genre">
            {SAMPLES.map((sample) => (
              <TabsTrigger key={sample.value} value={sample.value}>
                {sample.genre}
              </TabsTrigger>
            ))}
          </TabsList>
          {/*
            keepMounted holds all three excerpts in the DOM. Base UI still hides
            the inactive panels, but ~180 words of the only real prose sample on
            the site were otherwise unreachable to crawlers and text extractors,
            which unmount-by-default removed from the document entirely.
          */}
          {SAMPLES.map((sample) => (
            <TabsContent key={sample.value} value={sample.value} keepMounted>
              <article className="paper-surface mt-4 px-6 py-10 sm:px-12 sm:py-12">
                <div className="mx-auto max-w-[68ch]">
                  <p className="font-sans text-[0.65rem] font-medium tracking-[0.2em] text-paper-muted uppercase">
                    {sample.title} · Chapter one
                  </p>
                  <div className="prose-manuscript prose-manuscript--book mt-5">
                    {sample.paragraphs.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                    ))}
                  </div>
                  <p className="mt-8 border-t border-paper-edge pt-4 font-sans text-xs text-paper-muted">
                    {sample.genre} · chapter 1 excerpt
                  </p>
                </div>
              </article>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
