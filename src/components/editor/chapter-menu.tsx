"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChapter, deleteChapter, moveChapter, renameChapter } from "@/lib/actions/chapters";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";
import { useStudioSuspension } from "@/components/studio/studio-access-context";

/**
 * Structural chapter actions: rename, reorder, insert, delete. Content is the
 * editor's job; this menu only rearranges the shelf.
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
