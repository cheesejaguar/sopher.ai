import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { SampleOutput } from "@/components/marketing/sample-output";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <SampleOutput />
      <Pricing />
      <FinalCta />
    </>
  );
}
