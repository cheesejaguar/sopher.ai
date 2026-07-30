import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { devAuthAllowed } from "@/lib/clerk";
import { cn } from "@/lib/utils";

export function AuthPending() {
  return (
    <div className="instrument-surface-raised relative overflow-hidden rounded-sm p-6 sm:p-8">
      <span aria-hidden="true" className="spectral-rule absolute inset-x-0 top-0 h-px" />
      <p className="folio-label text-ai">Access sequence / pending</p>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">
        {devAuthAllowed ? "Local studio access" : "Sign-in is temporarily unavailable"}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {devAuthAllowed
          ? "Authentication is disabled in this development environment. You can inspect the studio with its local test identity."
          : "Account access is not configured for this deployment. No private project data is available."}
      </p>
      {devAuthAllowed ? (
        <Link href="/studio" className={cn(buttonVariants(), "mt-6 rounded-sm")}>
          Explore the local studio
        </Link>
      ) : (
        <a
          href="mailto:support@sopher.ai"
          className={cn(buttonVariants({ variant: "outline" }), "mt-6 rounded-sm")}
        >
          Contact support
        </a>
      )}
    </div>
  );
}
