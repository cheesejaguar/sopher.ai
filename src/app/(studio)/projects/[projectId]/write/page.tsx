import { Button } from "@/components/ui/button";
import { WritePanel } from "@/components/studio/write-panel";

export default function WritePage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">Write</h2>
          <p className="text-sm text-muted-foreground">
            Watch the draft arrive in real time. Pause between chapters whenever you like.
          </p>
        </div>
        <Button disabled>Start generation</Button>
      </header>

      <WritePanel />

      <p className="text-xs text-muted-foreground">
        Live generation comes online in a later phase — this stage will stream tokens as the chapter
        writers work in parallel.
      </p>
    </div>
  );
}
