"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  CornerDownLeft,
  Ellipsis,
  ImageIcon,
  Scissors,
  Sparkles,
  UnfoldVertical,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export type ContentToolId = "mermaid" | "illustration";

const PRESETS: { key: string; label: string; icon: typeof Sparkles; instruction: string }[] = [
  {
    key: "rewrite",
    label: "Rewrite",
    icon: Sparkles,
    instruction:
      "Rewrite this passage so it flows better. Preserve the meaning, tone, and approximate length.",
  },
  {
    key: "expand",
    label: "Expand",
    icon: UnfoldVertical,
    instruction:
      "Expand this passage with more sensory detail and interiority, roughly one and a half times its current length. Keep the voice.",
  },
  {
    key: "tighten",
    label: "Tighten",
    icon: Scissors,
    instruction:
      "Tighten this passage: cut filler, strengthen verbs, and keep the meaning. Aim for about two-thirds the length.",
  },
];

/**
 * The bubble menu over a text selection: preset AI edits, a custom
 * instruction, and content tools (diagram / illustration) in the overflow.
 */
export function SelectionToolbar({
  editor,
  busy,
  onEdit,
  onTool,
}: {
  editor: Editor;
  busy: boolean;
  onEdit: (instruction: string) => void;
  onTool: (toolId: ContentToolId) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");

  function submitCustom() {
    const instruction = custom.trim();
    if (!instruction) return;
    setCustomOpen(false);
    setCustom("");
    onEdit(instruction);
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selectionToolbar"
      updateDelay={150}
      shouldShow={({ editor: ed, state }) => ed.isEditable && !state.selection.empty}
      options={{ placement: "top", offset: 8 }}
      className="z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {busy ? (
        <span className="flex items-center gap-2 px-2 py-1 text-xs text-ai">
          <Spinner className="size-3.5" />
          Working on it…
        </span>
      ) : (
        <>
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="ghost"
              size="xs"
              onClick={() => onEdit(preset.instruction)}
            >
              <preset.icon aria-hidden="true" className="text-ai" />
              {preset.label}
            </Button>
          ))}

          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger render={<Button variant="ghost" size="xs" />}>Custom…</PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-80 p-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCustom();
                }}
                className="flex items-center gap-1.5"
              >
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Tell the editor what to do with the selection"
                  className="h-8 text-xs"
                  autoFocus
                  aria-label="Custom instruction"
                />
                <Button
                  type="submit"
                  size="icon-sm"
                  disabled={!custom.trim()}
                  aria-label="Send instruction"
                >
                  <CornerDownLeft aria-hidden="true" className="size-3.5" />
                </Button>
              </form>
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="More tools" />}
            >
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] tracking-widest uppercase">
                  Content tools
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onTool("mermaid")}>
                  <Workflow aria-hidden="true" className="text-ai" />
                  Diagram this
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTool("illustration")}>
                  <ImageIcon aria-hidden="true" className="text-ai" />
                  Illustrate this
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </BubbleMenu>
  );
}
