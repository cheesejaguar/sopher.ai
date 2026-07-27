import Link from "next/link";
import { BookX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BookX aria-hidden="true" className="size-5" />
      </span>
      <div className="max-w-md space-y-2">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          This book isn&apos;t on your shelf.
        </h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or the link points somewhere it shouldn&apos;t.
        </p>
      </div>
      <Button render={<Link href="/studio" />} nativeButton={false}>
        Back to your books
      </Button>
    </div>
  );
}
