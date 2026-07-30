import { CREDIT_PACKS } from "@/lib/billing/credits-shared";
import { FAQS, PIPELINE_STEPS } from "@/components/marketing/content";

/**
 * Structured data. Two audiences, one payload:
 *
 *  - Classic search, which uses it for rich results (FAQ accordions, pricing,
 *    sitelinks).
 *  - Answer engines, which retrieve far more reliably from explicit typed
 *    facts than from prose they have to infer structure from.
 *
 * Everything here is derived from the same constants the visible page renders,
 * so the two cannot drift. Structured data that contradicts the page is a spam
 * signal to Google and a stale quote to an LLM.
 */

export const SITE_URL = "https://sopher.ai";
export const SOCIAL_IMAGE = `${SITE_URL}/opengraph-image`;
export const SOCIAL_IMAGE_ALT = "sopher.ai — The book in your head, finally on the page.";

/**
 * JSON-LD goes in a script tag, so it needs dangerouslySetInnerHTML. The input
 * is our own constants, never user content — but `<` is still escaped, because
 * a literal `</script>` inside a JSON string would close the tag early and the
 * rest would parse as markup.
 */
function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Identity and search behaviour. Belongs on every page — it describes the site. */
export function SiteJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "sopher.ai",
            url: SITE_URL,
            logo: `${SITE_URL}/icon.svg`,
            description:
              "sopher.ai turns the book in an author's head into a complete, edited manuscript using a five-stage pipeline of AI agents.",
            email: "support@sopher.ai",
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: "sopher.ai",
            publisher: { "@id": `${SITE_URL}/#organization` },
            inLanguage: "en-US",
          },
        ],
      }}
    />
  );
}

/**
 * The product itself, priced. `offers` comes straight from CREDIT_PACKS, so the
 * prices a crawler sees are the prices checkout charges.
 */
export function ProductJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "sopher.ai",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Writing software",
        operatingSystem: "Web browser",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        description:
          "Describe the book in your head and sopher.ai plans it, writes every chapter in parallel, edits the manuscript, and checks continuity across the whole book.",
        offers: CREDIT_PACKS.map((pack) => ({
          "@type": "Offer",
          name: `${pack.name} — ${pack.credits} credits`,
          price: pack.usd.toFixed(2),
          priceCurrency: "USD",
          category: "Prepaid credits",
          url: `${SITE_URL}/pricing`,
        })),
        featureList: PIPELINE_STEPS.map((step) => `${step.name}: ${step.description}`),
      }}
    />
  );
}

/** The site's most quotable block, in the form answer engines retrieve best. */
export function FaqJsonLd({ items = FAQS }: { items?: { question: string; answer: string }[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }}
    />
  );
}

/** The generation pipeline as an explicit ordered procedure. */
export function HowToJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How sopher.ai writes a book",
        description: "Five agent stages turn an author's idea into a finished, edited manuscript.",
        step: PIPELINE_STEPS.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.name,
          text: step.description,
        })),
      }}
    />
  );
}

/** Trail for subpages. Pass the crumbs after the home page, in order. */
export function BreadcrumbJsonLd({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [{ name: "Home", path: "/" }, ...trail].map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: `${SITE_URL}${crumb.path}`,
        })),
      }}
    />
  );
}
