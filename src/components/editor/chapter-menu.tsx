"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Merge,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  addChapter,
  deleteChapter,
  getChapterSplitPoints,
  mergeChapterWithNext,
  moveChapter,
  renameChapter,
  splitChapter,
} from "@/lib/actions/chapters";
import type { ChapterSplitPoint } from "@/lib/chapter-split";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";
import { EXPORT_FORMATS, FORMAT_META } from "@/lib/export/types";
import { useStudioSuspension } from "@/components/studio/studio-access-context";

/**
 * Structural chapter actions: rename, reorder, insert, split, merge, delete,
 * and a single-chapter download. Content is the editor's job; this menu only
 * rearranges the shelf and hands one chapter out of it.
 */
export function ChapterMenu({
  projectId,
  chapterId,
  chapterNumber,
  title,
  isFirst,
  isLast,
}: {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const suspended = useStudioSuspension();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  /** null while the chapter's paragraph breaks are still being fetched. */
  const [splitPoints, setSplitPoints] = useState<ChapterSplitPoint[] | null>(null);
  const [splitOffset, setSplitOffset] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = title ? `${chapterNumber}. ${title}` : `Chapter ${chapterNumber}`;

  function run(action: () => Promise<unknown>, close?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        close?.();
        router.refresh();
      } catch {
        setError("That didn't work — try again.");
      }
    });
  }

  // The menu lives in the sidebar and never sees the chapter text, so the split
  // points are fetched when the dialog opens rather than pushed down as a prop.
  function openSplit() {
    setError(null);
    setSplitPoints(null);
    setSplitOffset(null);
    setSplitOpen(true);
    startTransition(async () => {
      try {
        const points = await getChapterSplitPoints(chapterId);
        setSplitPoints(points);
        setSplitOffset(points[0] ? String(points[0].offset) : null);
      } catch {
        setError("Couldn't read this chapter — try again.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${label}`}
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil aria-hidden="true" className="size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isFirst || pending}
            onClick={() => run(() => moveChapter(chapterId, "up"))}
          >
            <ArrowUp aria-hidden="true" className="size-3.5" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isLast || pending}
            onClick={() => run(() => moveChapter(chapterId, "down"))}
          >
            <ArrowDown aria-hidden="true" className="size-3.5" /> Move down
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onClick={() => run(() => addChapter(projectId, chapterNumber))}
          >
            <Plus aria-hidden="true" className="size-3.5" /> Insert chapter after
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onClick={openSplit}>
            <Scissors aria-hidden="true" className="size-3.5" /> Split…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLast || pending} onClick={() => setMergeOpen(true)}>
            <Merge aria-hidden="true" className="size-3.5" /> Merge with next…
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download aria-hidden="true" className="size-3.5" /> Export chapter
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format}
                  render={
                    <a
                      href={`/api/chapters/${chapterId}/export?format=${format}`}
                      download
                      aria-label={`Download ${label} as ${FORMAT_META[format].label}`}
                    />
                  }
                >
                  {FORMAT_META[format].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled={pending || suspended} onClick={() => setRegenOpen(true)}>
            <RefreshCw aria-hidden="true" className="size-3.5" />
            {suspended ? "Regenerate unavailable · account suspended" : "Regenerate…"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" className="size-3.5" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chapter {chapterNumber}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) =>
              run(
                () => renameChapter(chapterId, String(formData.get("title") ?? "")),
                () => setRenameOpen(false),
              )
            }
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`ch-rename-${chapterId}`}>Title</Label>
              <Input
                id={`ch-rename-${chapterId}`}
                name="title"
                defaultValue={title ?? ""}
                maxLength={300}
                placeholder={`Chapter ${chapterNumber}`}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the plain chapter number.
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split {label}</DialogTitle>
            <DialogDescription>
              The paragraph you choose starts a new chapter {chapterNumber + 1}. Everything before
              it stays here, and every chapter after it moves one number later. Today&rsquo;s text
              is saved to the revision history first.
            </DialogDescription>
          </DialogHeader>
          {splitPoints === null ? (
            <p className="text-sm text-muted-foreground">Reading the chapter…</p>
          ) : splitPoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This chapter is one unbroken block of text. Add a paragraph break where the new
              chapter should start, save, then split.
            </p>
          ) : (
            <fieldset className="min-w-0" disabled={pending}>
              <legend className="mb-1.5 text-sm font-medium">Start the new chapter at</legend>
              <RadioGroup
                value={splitOffset ?? ""}
                onValueChange={(value) => setSplitOffset(String(value))}
                className="max-h-64 gap-0 overflow-y-auto rounded-sm border border-border"
              >
                {splitPoints.map((point) => {
                  const id = `ch-split-${chapterId}-${point.offset}`;
                  return (
                    <label
                      key={point.offset}
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-border p-3 text-sm leading-relaxed transition-colors last:border-b-0 hover:bg-accent/60"
                    >
                      <RadioGroupItem id={id} value={String(point.offset)} className="mt-1" />
                      <span className="min-w-0 text-muted-foreground">{point.preview}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSplitOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || splitOffset === null}
              onClick={() => {
                if (splitOffset === null) return;
                run(
                  () => splitChapter(chapterId, Number(splitOffset)),
                  () => setSplitOpen(false),
                );
              }}
            >
              {pending ? "Splitting…" : "Split chapter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Merge chapter {chapterNumber + 1} into {label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Chapter {chapterNumber + 1}&rsquo;s text is appended here and its slot closes, so
              every chapter after it moves one number earlier. If it had a title, that title becomes
              a heading in the merged prose. Both chapters are saved to this chapter&rsquo;s
              revision history first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="px-6 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => mergeChapterWithNext(chapterId),
                  () => {
                    setMergeOpen(false);
                    router.push(`/projects/${projectId}/editor/${chapterNumber}`);
                  },
                )
              }
            >
              {pending ? "Merging…" : "Merge chapters"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Rewrite {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The chapter runs back through the full writing pipeline with your current story bible
              and brief. Today&rsquo;s text is saved to the revision history first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="px-6 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setRegenOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const response = await idempotentPaidFetch(
                      `/api/chapters/${chapterId}/regenerate`,
                      { method: "POST" },
                    );
                    if (!response.ok) {
                      const body = (await response.json().catch(() => ({}))) as {
                        error?: string;
                      };
                      throw new Error(body.error ?? "Could not start");
                    }
                    acknowledgePaidResponse(response);
                  },
                  () => {
                    setRegenOpen(false);
                    router.push(`/projects/${projectId}/write`);
                  },
                )
              }
            >
              {pending ? "Starting…" : "Rewrite chapter"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The chapter and its revision history are removed and later chapters renumber. There is
              no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="px-6 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteChapter(chapterId),
                  () => {
                    setDeleteOpen(false);
                    router.push(`/projects/${projectId}/editor`);
                  },
                )
              }
            >
              {pending ? "Deleting…" : "Delete chapter"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
