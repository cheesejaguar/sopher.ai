import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { SampleOutput } from "@/components/marketing/sample-output";
import { FaqJsonLd, HowToJsonLd, ProductJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  // Overrides the title template — the landing page should not read
  // "Home · sopher.ai".
  title: { absolute: "sopher.ai — The book in your head, finally on the page." },
  description:
    "Turn the book in your head into a complete, editable manuscript. Sopher plans, drafts, and refines it while you stay in control.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <>
      <ProductJsonLd />
      <HowToJsonLd />
      <FaqJsonLd />
      <Hero />
      <HowItWorks />
      <SampleOutput />
      <Pricing />
      {/*
        The FAQ lived only on /pricing. It is the site's most retrievable block
        — real dl/dt/dd markup, direct factual answers — and answer engines
        overwhelmingly fetch the homepage. It stays on /pricing too.
      */}
      <Faq />
      <FinalCta />
    </>
  );
}
