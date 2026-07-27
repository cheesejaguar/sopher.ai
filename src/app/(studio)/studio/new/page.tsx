import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Calculator, Layers, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "A new book",
};

const steps = [
  {
    icon: BookOpen,
    title: "Genre",
    description: "Pick the shelf it belongs on. Structure, pacing, and conventions follow.",
  },
  {
    icon: PenLine,
    title: "Brief",
    description: "Tell the story in your own words — premise, people, the feeling it should leave.",
  },
  {
    icon: Layers,
    title: "Shape",
    description: "Choose chapter count, length, and a quality tier: Draft, Standard, or Premium.",
  },
  {
    icon: Calculator,
    title: "Estimate",
    description: "See the full cost of the book before a single word is generated.",
  },
];

export default function NewBookPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">A new book</h1>
        <p className="text-sm text-muted-foreground">
          Four short steps from idea to estimate. Nothing runs until you approve the cost.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>How the brief wizard works</CardTitle>
          <CardDescription>
            Genre → Brief → Shape → Estimate, then the agents take it from there.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm text-primary tabular-nums">
                  {index + 1}
                </span>
                <div className="space-y-0.5 pt-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <step.icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <Button disabled>Coming online soon</Button>
          <Button variant="ghost" render={<Link href="/studio" />} nativeButton={false}>
            Back to your books
          </Button>
        </CardFooter>
      </Card>

      <p className="text-xs text-muted-foreground">
        The wizard is being wired up in a later phase. Your shelf is safe in the meantime.
      </p>
    </div>
  );
}
