import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p aria-hidden="true" className="font-display text-6xl font-semibold text-muted-foreground">
        404
      </p>
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          This page isn&rsquo;t in the manuscript
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The address may be mistyped, or the page may have moved.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Home
        </Link>
        <Link href="/studio" className={buttonVariants()}>
          Open the studio
        </Link>
      </div>
    </div>
  );
}
