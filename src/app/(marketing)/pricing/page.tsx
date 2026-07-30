import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { Pricing } from "@/components/marketing/pricing";
import { BreadcrumbJsonLd, FaqJsonLd, ProductJsonLd } from "@/components/seo/json-ld";
import { PUBLIC_BOOK_COST_RANGE } from "@/lib/billing/public-pricing";
import { publicPageMetadata } from "@/lib/marketing/public-metadata";
import { INCLUDED_STORY_OFFER } from "@/lib/marketing/trial-offer";

export const metadata: Metadata = publicPageMetadata({
  title: "Pricing",
  description: `${INCLUDED_STORY_OFFER}. Full books use prepaid credits, typically ${PUBLIC_BOOK_COST_RANGE} for a novella, with no subscription.`,
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <ProductJsonLd />
      <FaqJsonLd />
      <BreadcrumbJsonLd trail={[{ name: "Pricing", path: "/pricing" }]} />
      <Pricing headingLevel={1} />
      <Faq />
    </>
  );
}
