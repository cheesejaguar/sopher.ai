import type { Metadata } from "next";

import { NewBookWizard } from "@/components/wizard/new-book-wizard";

export const metadata: Metadata = {
  title: "A new book",
};

export default function NewBookPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">A new book</h1>
        <p className="text-sm text-muted-foreground">
          Four short steps from idea to estimate. Nothing runs until you approve the cost.
        </p>
      </header>

      <NewBookWizard />
    </div>
  );
}
