"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  CornerDownLeft,
  Ellipsis,
  ImageIcon,
  RefreshCw,
  Scissors,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type ContentToolId = "mermaid" | "illustration";

const PRESETS: { key: string; label: string; icon: typeof RefreshCw; instruction: string }[] = [
  {
    key: "rewrite",
    label: "Rewrite",
    icon: RefreshCw,
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
 *
 * The menu element is appended right after the ProseMirror editable, so Tab
 * from the manuscript lands on it — `role="group"` and a name make that stop
 * meaningful, and the plugin keeps the menu open while focus is inside it.
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
      options={{ placement: "top", offset: 8, strategy: "fixed" }}
      role="group"
      aria-label="AI tools for the selected passage"
      className="z-30 flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-sm border border-border bg-popover p-1 shadow-md"
    >
      {busy ? (
        <span role="status" className="flex items-center gap-2 px-2 py-1 text-xs text-ai">
          <Spinner aria-hidden="true" className="size-3.5" />
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

/**
 * A viewport-safe counterpart to the floating selection toolbar. Phone users
 * keep the native text selection while every AI and content action moves into
 * one keyboard- and screen-reader-operable sheet.
 */
export function SelectionToolsSheet({
  open,
  onOpenChange,
  busy,
  onEdit,
  onTool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onEdit: (instruction: string) => void;
  onTool: (toolId: ContentToolId) => void;
}) {
  const [custom, setCustom] = useState("");

  function runEdit(instruction: string) {
    onOpenChange(false);
    onEdit(instruction);
  }

  function runTool(tool: ContentToolId) {
    onOpenChange(false);
    onTool(tool);
  }

  function submitCustom() {
    const instruction = custom.trim();
    if (!instruction) return;
    setCustom("");
    runEdit(instruction);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCustom("");
      }}
    >
      <SheetContent side="bottom" className="max-h-[min(88dvh,42rem)] gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-4 py-3 pr-14 text-left">
          <SheetTitle>Edit selected passage</SheetTitle>
          <SheetDescription>
            The editor will create a suggestion first. You decide whether to apply it.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-4">
          {busy ? (
            <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-ai">
              <Spinner aria-hidden="true" className="size-4" />
              Working on the selected passage…
            </p>
          ) : (
            <>
              <section aria-labelledby="selection-presets-heading">
                <h2 id="selection-presets-heading" className="folio-label text-muted-foreground">
                  Editorial passes
                </h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      variant="outline"
                      className="min-h-11 justify-start rounded-sm"
                      onClick={() => runEdit(preset.instruction)}
                    >
                      <preset.icon aria-hidden="true" className="text-ai" />
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="custom-edit-heading">
                <h2 id="custom-edit-heading" className="folio-label text-muted-foreground">
                  Custom direction
                </h2>
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitCustom();
                  }}
                >
                  <Textarea
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    placeholder="Tell the editor what to change, preserve, or emphasize"
                    aria-label="Custom editing instruction"
                    rows={3}
                  />
                  <Button
                    type="submit"
                    className="min-h-11 w-full rounded-sm"
                    disabled={!custom.trim()}
                  >
                    <CornerDownLeft aria-hidden="true" />
                    Create suggestion
                  </Button>
                </form>
              </section>

              <section aria-labelledby="content-tools-heading">
                <h2 id="content-tools-heading" className="folio-label text-muted-foreground">
                  Content tools
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-sm"
                    onClick={() => runTool("mermaid")}
                  >
                    <Workflow aria-hidden="true" className="text-ai" />
                    Diagram
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-sm"
                    onClick={() => runTool("illustration")}
                  >
                    <ImageIcon aria-hidden="true" className="text-ai" />
                    Illustrate
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
