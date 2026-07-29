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
  title: "sopher.ai — Any book you can imagine, made for the people you love",
  description:
    "Describe any book in a sentence. A team of AI agents plans it, writes every chapter, and edits the whole manuscript — usually in under an hour.",
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
