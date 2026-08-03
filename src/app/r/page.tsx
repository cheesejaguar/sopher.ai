import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reader edition",
  description: "An unlisted reader edition shared by its author.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
  referrer: "no-referrer",
};

export default function ReaderLandingPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="safe-area-page grid min-h-dvh place-items-center px-6 py-16"
    >
      <section className="instrument-surface max-w-lg rounded-sm p-8 text-center">
        <p className="folio-label text-primary">Reader edition</p>
        <h1 className="mt-3 text-2xl font-semibold text-balance">Open the complete reader link</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ask the author to resend the full link. Reader editions use both a share address and a
          private fragment that is not stored in page history.
        </p>
      </section>
    </main>
  );
}
