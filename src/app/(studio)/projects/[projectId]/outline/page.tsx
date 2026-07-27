import { OutlineList } from "@/components/studio/outline-list";
import { formatWords, sampleBrief, sampleChapters } from "@/lib/placeholder-data";

export default function OutlinePage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Outline</h2>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {sampleChapters.length} chapters · ~{formatWords(sampleBrief.targetWords)} words planned
        </p>
      </header>
      <OutlineList chapters={sampleChapters} />
      <p className="text-xs text-muted-foreground">
        The outline updates as chapters are drafted — the Continuity agent flags any drift from it.
      </p>
    </div>
  );
}
