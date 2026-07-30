import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative border-y border-white/10 bg-[#0d0d13] text-[#f6f4fb]"
    >
      <span aria-hidden="true" className="spectral-rule absolute top-0 left-0 h-px w-48 sm:w-72" />
      <div className="mx-auto grid w-full max-w-7xl gap-9 px-6 py-20 sm:py-24 lg:grid-cols-12 lg:items-end lg:px-8">
        <div className="lg:col-span-8">
          <p className="folio-label text-[#b8adff]">Next action / brief 01</p>
          <h2
            id="final-cta-heading"
            className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl"
          >
            The desk is set.
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-[#c5c2cc]">
            Bring the book you&apos;ve been carrying around. The agents will handle the typing.
          </p>
        </div>
        <div className="lg:col-span-4 lg:flex lg:justify-end">
          <a
            href="/studio"
            className={cn(
              buttonVariants({ size: "lg" }),
              "min-h-12 w-full rounded-sm !bg-[#6243d7] px-7 text-base !text-white hover:!bg-[#7155e4] sm:w-auto",
            )}
          >
            Start your book
          </a>
        </div>
      </div>
    </section>
  );
}
