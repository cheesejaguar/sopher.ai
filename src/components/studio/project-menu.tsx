"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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
import { deleteProject, updateProject } from "@/lib/actions/projects";

/**
 * The card's overflow menu — the first place a project can be renamed,
 * archived, or deleted from the UI. Deletion is the only destructive path and
 * sits behind an explicit confirmation naming the project.
 */
export function ProjectMenu({
  projectId,
  title,
  archived,
}: {
  projectId: string;
  title: string;
  archived?: boolean;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function rename(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateProject(projectId, { title: String(formData.get("title") ?? "").trim() });
        setRenameOpen(false);
      } catch {
        setError("Could not rename — try again.");
      }
    });
  }

  function setArchived(next: boolean) {
    startTransition(async () => {
      try {
        await updateProject(projectId, { status: next ? "archived" : "draft" });
      } catch {
        // The card simply doesn't move; nothing destructive happened.
      }
    });
  }

  function destroy() {
    startTransition(async () => {
      // deleteProject redirects to /studio on success, so only failures return.
      try {
        await deleteProject(projectId);
      } catch {
        setDeleteOpen(false);
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
              aria-label={`Actions for ${title}`}
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil aria-hidden="true" className="size-3.5" /> Rename
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onClick={() => setArchived(false)}>
              <ArchiveRestore aria-hidden="true" className="size-3.5" /> Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setArchived(true)}>
              <Archive aria-hidden="true" className="size-3.5" /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" className="size-3.5" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <form action={rename} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`rename-${projectId}`}>Title</Label>
              <Input
                id={`rename-${projectId}`}
                name="title"
                defaultValue={title}
                required
                maxLength={200}
              />
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project — manuscript, story bible, and exports. There is
              no undo. Export anything you want to keep first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={destroy} disabled={pending}>
              {pending ? "Deleting…" : "Delete forever"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
