import { MessageSquareText, Redo2, Sparkles, Undo2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/** Disabled floating toolbar — the suggestion editor lands in a later phase. */
export function EditorToolbarMock() {
  return (
    <div className="sticky bottom-6 z-10 flex justify-center">
      <div
        role="toolbar"
        aria-label="Editing tools"
        className="flex items-center gap-0.5 rounded-full border border-border bg-popover/95 px-2 py-1.5 shadow-lg backdrop-blur"
      >
        <Button variant="ghost" size="icon-sm" disabled aria-label="Suggest a revision">
          <Sparkles aria-hidden="true" className="text-ai" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled aria-label="Tighten this passage">
          <WandSparkles aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled aria-label="Leave a note">
          <MessageSquareText aria-hidden="true" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-4!" />
        <Button variant="ghost" size="icon-sm" disabled aria-label="Undo">
          <Undo2 aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled aria-label="Redo">
          <Redo2 aria-hidden="true" />
        </Button>
        <span className="px-2 text-xs whitespace-nowrap text-muted-foreground">
          Suggestions coming soon
        </span>
      </div>
    </div>
  );
}
