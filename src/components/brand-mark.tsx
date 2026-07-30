import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  showWordmark?: boolean;
  label?: string;
};

/**
 * A stacked folio whose front sheet resolves into an S. The offset page is the
 * manuscript in progress; the solid page is the authored book.
 */
export function BrandMark({ className, showWordmark = true, label = "sopher.ai" }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-7 shrink-0"
        role={showWordmark ? "presentation" : "img"}
        aria-hidden={showWordmark ? true : undefined}
        aria-label={showWordmark ? undefined : label}
      >
        <path
          d="M11 4.5h15.5V24H11z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity=".42"
        />
        <path d="M5.5 8H22v5H10.5v3H22v10H5.5v-5h11.25v-3H5.5z" fill="currentColor" />
        <path d="M22 8v5h4.5" fill="none" stroke="var(--ai)" strokeWidth="1.5" />
      </svg>
      {showWordmark ? (
        <span className="font-display text-[0.95rem] font-semibold tracking-[0.2em] uppercase">
          sopher<span className="text-primary">.ai</span>
        </span>
      ) : null}
    </span>
  );
}
