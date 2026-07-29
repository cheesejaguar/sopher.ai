import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { Pricing } from "@/components/marketing/pricing";
import { BreadcrumbJsonLd, FaqJsonLd, ProductJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Prepaid credits, no subscription. A finished book runs about 21\u201336 credits, new accounts start with free credits, and every manuscript comes with a full cost report.",
  alternates: { canonical: "/pricing" },
};

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
