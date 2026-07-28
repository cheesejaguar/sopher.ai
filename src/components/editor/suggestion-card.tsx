"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { wordDiff } from "@/lib/editor/word-diff";
import type { SuggestionDTO } from "@/lib/editor/types";

const severityDotClasses: Record<SuggestionDTO["severity"], string> = {
  info: "bg-ai",
  warning: "bg-ember",
  error: "bg-destructive",
};

/** The dot encodes severity in colour alone — expose it as text for AT. */
export const severityLabels: Record<SuggestionDTO["severity"], string> = {
  info: "Suggestion",
  warning: "Worth a look",
  error: "Needs attention",
};

const typeLabels: Record<string, string> = {
  line: "Line edit",
  structure: "Structure",
  continuity: "Continuity",
  style: "Style",
  selection: "Your request",
};

export function suggestionTypeLabel(type: string): string {
  return typeLabels[type] ?? type;
}

/**
 * Word-level diff. Removed and added runs use `<del>`/`<ins>` so the change is
 * programmatically determinable rather than inferred from colour (1.3.1);
 * `no-underline` keeps the browser default off the design.
 */
function DiffView({ before, after }: { before: string; after: string }) {
  const ops = wordDiff(before, after);
  return (
    <p className="font-serif text-sm leading-relaxed text-paper-foreground">
      {ops.map((op, i) => {
        const text = `${op.text}${i < ops.length - 1 ? " " : ""}`;
        if (op.type === "del") {
          return (
            <del
              key={i}
              className="bg-destructive/10 text-destructive/80 line-through decoration-destructive/50"
            >
              {text}
            </del>
          );
        }
        if (op.type === "ins") {
          return (
            <ins key={i} className="rounded-[2px] bg-ai-soft/80 text-ai no-underline">
              {text}
            </ins>
          );
        }
        return <span key={i}>{text}</span>;
      })}
    </p>
  );
}

/**
 * The inline card shown under the active suggestion's anchor: word-level
 * diff, rationale, and accept / reject / edit-then-accept actions.
 */
export function SuggestionCard({
  suggestion,
  busy,
  onAccept,
  onAcceptEdited,
  onReject,
  onDismiss,
}: {
  suggestion: SuggestionDTO;
  busy: boolean;
  onAccept: () => void;
  onAcceptEdited: (text: string) => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.suggestedText);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  // Leaving edit mode unmounts the Cancel button focus was sitting on — hand it
  // back to the control that opened the textarea instead of losing it.
  useEffect(() => {
    if (editing || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    editButtonRef.current?.focus();
  }, [editing]);

  return (
    <div className="rounded-lg border border-ai/30 bg-popover shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn("size-1.5 rounded-full", severityDotClasses[suggestion.severity])}>
          <span className="sr-only">{severityLabels[suggestion.severity]}.</span>
        </span>
        <span className="text-xs font-medium text-ai">
          {suggestionTypeLabel(suggestion.suggestionType)}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase">
          {suggestion.passType === "selection" ? "selection edit" : `${suggestion.passType} pass`}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close this suggestion without deciding"
          className="ml-auto"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className="font-serif text-sm"
            aria-label="Edit the suggested text"
          />
        ) : (
          <DiffView before={suggestion.anchor.originalText} after={suggestion.suggestedText} />
        )}
        <p className="font-sans text-xs leading-relaxed text-muted-foreground">
          {suggestion.explanation}
        </p>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={busy || !draft.trim()}
              onClick={() => onAcceptEdited(draft)}
            >
              <Check aria-hidden="true" /> Apply edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                restoreFocusRef.current = true;
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {/* The glyph hints are for the eye; the shortcuts are spelled out
                in the editor's description, so keep them out of the name. */}
            <Button size="sm" disabled={busy} onClick={onAccept}>
              <Check aria-hidden="true" /> Accept
              <kbd aria-hidden="true" className="ml-0.5 font-mono text-[10px] opacity-70">
                ⌘⏎
              </kbd>
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onReject}>
              <X aria-hidden="true" /> Reject
              <kbd aria-hidden="true" className="ml-0.5 font-mono text-[10px] opacity-70">
                ⌘⌫
              </kbd>
            </Button>
            <Button
              ref={editButtonRef}
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(suggestion.suggestedText);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" /> Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
