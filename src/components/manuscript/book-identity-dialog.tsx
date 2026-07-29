"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBook } from "@/lib/actions/books";

/**
 * Edits the book's identity — title, synopsis, author byline. The concept
 * agent proposes these once; after that they belong to the author, and the
 * byline flows into every export in place of the house line.
 */
export function BookIdentityDialog({
  projectId,
  title,
  synopsis,
  author,
}: {
  projectId: string;
  title: string;
  synopsis: string | null;
  author: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateBook(projectId, {
          title: String(formData.get("title") ?? "").trim(),
          synopsis: String(formData.get("synopsis") ?? "").trim() || null,
          author: String(formData.get("author") ?? "").trim() || null,
        });
        setOpen(false);
      } catch {
        setError("Could not save — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" aria-label="Edit title, synopsis, and author" />}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        Edit details
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book details</DialogTitle>
          <DialogDescription>
            The title, synopsis, and author byline used on the title page and in every export.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="book-title">Title</Label>
            <Input id="book-title" name="title" defaultValue={title} required maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-author">Author</Label>
            <Input
              id="book-author"
              name="author"
              defaultValue={author ?? ""}
              maxLength={200}
              placeholder="Written with sopher.ai"
            />
            <p className="text-xs text-muted-foreground">Leave blank to keep the default byline.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-synopsis">Synopsis</Label>
            <Textarea
              id="book-synopsis"
              name="synopsis"
              defaultValue={synopsis ?? ""}
              maxLength={2000}
              rows={4}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
