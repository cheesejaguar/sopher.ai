import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { Pricing } from "@/components/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay per book, not per month. Draft, Standard, and Premium quality tiers with a full cost report for every manuscript.",
};

export default function PricingPage() {
  return (
    <>
      <Pricing headingLevel={1} />
      <Faq />
    </>
  );
}
