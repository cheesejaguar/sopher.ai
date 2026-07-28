import { GENRE_IDS, GENRE_TEMPLATES, type GenreId } from "@/ai/knowledge/genres";

export type { GenreId };

/** A compact, client-safe view of a genre template for pickers and cards. */
export interface GenreOption {
  id: GenreId;
  name: string;
  description: string;
  subgenres: readonly string[];
  /** First couple of reader expectations — enough to set the tone. */
  readerExpectations: readonly string[];
}

/**
 * Client-safe genre catalog, mapped once at module level from the full
 * knowledge templates. Import this — not the templates — in UI code.
 */
export const GENRES: readonly GenreOption[] = GENRE_IDS.map((id) => {
  const template = GENRE_TEMPLATES[id];
  return {
    id,
    name: template.genre,
    description: template.description,
    subgenres: template.subgenres,
    readerExpectations: template.readerExpectations.slice(0, 2),
  };
});

const nameById = new Map<string, string>(GENRES.map((genre) => [genre.id, genre.name]));

/** Display name for a stored genre id; falls back to the raw value. */
export function genreLabel(genreId: string | null | undefined): string {
  if (!genreId) return "Fiction";
  return nameById.get(genreId) ?? genreId;
}
