import type { Metadata } from "next";

import { NewBookWizard } from "@/components/wizard/new-book-wizard";
import { GENRE_IDS, type GenreId } from "@/ai/knowledge/genres";

export const metadata: Metadata = {
  title: "A new book",
};

/**
 * The genre landing pages link here with ?genre=, so someone who arrived from a
 * search for "write a fantasy novel" does not have to re-answer the question
 * they already answered by clicking. Validated against the catalog — an unknown
 * value is ignored rather than trusted.
 */
export default async function NewBookPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre } = await searchParams;
  const initialGenre = (GENRE_IDS as readonly string[]).includes(genre ?? "")
    ? (genre as GenreId)
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">A new book</h1>
        <p className="text-sm text-muted-foreground">
          Four short steps from idea to estimate. Nothing runs until you approve the cost.
        </p>
      </header>

      <NewBookWizard initialGenre={initialGenre} />
    </div>
  );
}
