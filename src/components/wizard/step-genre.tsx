"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { GENRES } from "@/lib/genres";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_GENRE,
  MAX_CHAPTERS,
  MAX_CUSTOM_GENRE_LENGTH,
  MAX_WORDS_PER_CHAPTER,
  MIN_CHAPTERS,
  minWordsForGenre,
  shapeDefaultsForGenre,
  type WizardActionEvent,
  type WizardGenre,
  type WizardState,
} from "@/components/wizard/wizard-state";

export function StepGenre({
  state,
  dispatch,
  experience = "full_book",
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardActionEvent>;
  experience?: "trial_short_story" | "full_book";
}) {
  /**
   * Picking a genre also moves the shape sliders to that genre's defaults, so a
   * children's book does not start life at twelve 3,000-word chapters. The
   * included story has a server-enforced shape, so it is left alone.
   */
  function selectGenre(genre: WizardGenre) {
    if (experience !== "full_book") {
      dispatch({ type: "patch", patch: { genre, subgenre: null } });
      return;
    }
    // The seven original genres carry no defaults, so switching to one leaves
    // the sliders where they are — which, coming from a children's book, would
    // strand wordsPerChapter below the adult floor the shape step then renders
    // as its minimum. Clamp on every change, the same way restoreDraft does.
    const defaults = shapeDefaultsForGenre(genre);
    const minWords = minWordsForGenre(genre);
    dispatch({
      type: "patch",
      patch: {
        genre,
        subgenre: null,
        chapters: Math.min(
          Math.max(defaults?.chapters ?? state.chapters, MIN_CHAPTERS),
          MAX_CHAPTERS,
        ),
        wordsPerChapter: Math.min(
          Math.max(defaults?.wordsPerChapter ?? state.wordsPerChapter, minWords),
          MAX_WORDS_PER_CHAPTER,
        ),
      },
    });
  }

  const customSelected = state.genre === CUSTOM_GENRE;

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Choose a genre</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {GENRES.map((genre) => {
          const selected = state.genre === genre.id;
          return (
            <div
              key={genre.id}
              className={cn(
                "rounded-sm border bg-card transition-colors",
                selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/25",
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  selected
                    ? dispatch({ type: "patch", patch: { genre: null, subgenre: null } })
                    : selectGenre(genre.id)
                }
                className="flex min-h-11 w-full flex-col gap-1.5 rounded-sm p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold tracking-tight">
                    {genre.name}
                  </span>
                  {selected ? (
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {genre.description}
                </span>
                <span className="mt-1 space-y-0.5 text-xs text-muted-foreground/80">
                  {genre.readerExpectations.map((expectation) => (
                    <span key={expectation} className="block">
                      · {expectation}
                    </span>
                  ))}
                </span>
              </button>

              {selected ? (
                <div className="border-t px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Narrow it down (optional)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {genre.subgenres.map((subgenre) => {
                      const chipSelected = state.subgenre === subgenre;
                      return (
                        <button
                          key={subgenre}
                          type="button"
                          aria-pressed={chipSelected}
                          onClick={() =>
                            dispatch({
                              type: "patch",
                              patch: { subgenre: chipSelected ? null : subgenre },
                            })
                          }
                          className={cn(
                            "min-h-11 rounded-sm border px-3 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:py-1",
                            chipSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                          )}
                        >
                          {subgenre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <div
          className={cn(
            "rounded-sm border bg-card transition-colors",
            customSelected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/25",
          )}
        >
          <button
            type="button"
            aria-pressed={customSelected}
            onClick={() =>
              customSelected
                ? dispatch({ type: "patch", patch: { genre: null, subgenre: null } })
                : selectGenre(CUSTOM_GENRE)
            }
            className="flex min-h-11 w-full flex-col gap-1.5 rounded-sm p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-semibold tracking-tight">
                Something else
              </span>
              {customSelected ? (
                <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden="true" className="size-3" />
                </span>
              ) : null}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              Your book does not have to fit a shelf. Describe it in your own words and the writing
              follows what you say rather than a template.
            </span>
          </button>

          {customSelected ? (
            <div className="border-t px-4 py-3">
              <Label htmlFor="wizard-custom-genre" className="text-xs font-medium">
                What are you writing?
              </Label>
              <Input
                id="wizard-custom-genre"
                value={state.customGenre}
                maxLength={MAX_CUSTOM_GENRE_LENGTH}
                autoComplete="off"
                placeholder="A cozy western, a poetry collection, a business book…"
                onChange={(event) =>
                  dispatch({ type: "patch", patch: { customGenre: event.target.value } })
                }
                className="mt-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                A few words is enough. You can say more in your brief on the next step.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
