"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { GENRES } from "@/lib/genres";
import type { WizardActionEvent, WizardState } from "@/components/wizard/wizard-state";

export function StepGenre({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardActionEvent>;
}) {
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
                  dispatch({
                    type: "patch",
                    patch: selected
                      ? { genre: null, subgenre: null }
                      : { genre: genre.id, subgenre: null },
                  })
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
      </div>
    </fieldset>
  );
}
