import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

const STAGES = ["Concept", "Outline", "Chapters", "Editor", "Continuity"];

export function AuthShell({
  mode,
  title,
  description,
  children,
}: {
  mode: "Sign in" | "Create account";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="grid min-h-dvh bg-background font-sans text-foreground outline-none [&_.text-primary]:text-[#5130b8] dark:[&_.text-primary]:text-[#b5aaff] lg:grid-cols-2"
    >
      <section
        aria-labelledby="auth-heading"
        className="instrument-canvas relative flex min-h-[25rem] flex-col border-b border-border px-6 py-6 sm:px-10 sm:py-8 lg:min-h-dvh lg:border-r lg:border-b-0 lg:px-12 lg:py-10"
      >
        <Link
          href="/"
          aria-label="sopher.ai home"
          className="inline-flex min-h-11 w-fit items-center"
        >
          <BrandMark />
        </Link>

        <div className="my-auto max-w-xl py-14">
          <p className="folio-label text-primary">Account desk / secure access</p>
          <h1
            id="auth-heading"
            className="mt-5 font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl"
          >
            {title}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-pretty text-muted-foreground sm:text-lg">
            {description}
          </p>
        </div>

        <ol
          aria-label="The five manuscript stages"
          className="grid grid-cols-5 border-y border-border"
        >
          {STAGES.map((stage, index) => (
            <li
              key={stage}
              className="border-r border-border px-1 py-3 text-center last:border-r-0 sm:px-2 sm:text-left"
            >
              <span className="block font-mono text-[0.6875rem] text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 hidden text-[0.6875rem] text-muted-foreground uppercase sm:block">
                {stage}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label={mode}
        className="flex min-h-[32rem] items-center justify-center bg-background px-6 py-14 sm:px-10 lg:min-h-dvh lg:px-12"
      >
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            <p className="folio-label text-muted-foreground">{mode}</p>
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ion uppercase">
              Private session
            </span>
          </div>
          <div className="[&_.cl-card]:rounded-sm [&_.cl-card]:border [&_.cl-card]:border-border [&_.cl-card]:shadow-none">
            {children}
          </div>
          <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            Need help?{" "}
            <a href="mailto:support@sopher.ai" className="text-primary hover:underline">
              support@sopher.ai
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
