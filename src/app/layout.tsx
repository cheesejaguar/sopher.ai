import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans, Literata } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";
import { SkipLink } from "@/components/ui/skip-link";
import { clerkEnabled } from "@/lib/clerk";
import { SITE_URL, SiteJsonLd } from "@/components/seo/json-ld";
import "./globals.css";

/**
 * Was hardcoded. As an env var, previews and local dev stop polluting the
 * production property with synthetic traffic — leave it unset and GA simply
 * does not load.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  axes: ["opsz"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Under the ~160 characters Google renders; the old one was 244 and got cut. */
const DESCRIPTION =
  "Describe any book in a sentence. A team of AI agents plans it, writes every chapter, and edits the whole manuscript — usually in under an hour.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "sopher.ai — Any book you can imagine, made for the people you love",
    template: "%s · sopher.ai",
  },
  description: DESCRIPTION,
  applicationName: "sopher.ai",
  authors: [{ name: "sopher.ai", url: SITE_URL }],
  creator: "sopher.ai",
  publisher: "sopher.ai",
  category: "technology",
  keywords: [
    "AI book writing",
    "write a book with AI",
    "AI novel generator",
    "AI manuscript editor",
    "personalized book",
    "custom story generator",
    "AI ghostwriter",
  ],
  // Every page gets a canonical. Without one, a single ?utm_source= tag turns
  // one page into two indexable URLs competing with each other.
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "sopher.ai",
    type: "website",
    url: SITE_URL,
    locale: "en_US",
    title: "sopher.ai — Any book you can imagine, made for the people you love",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "sopher.ai — Any book you can imagine, made for the people you love",
    description: DESCRIPTION,
  },
  // Set GOOGLE_SITE_VERIFICATION once Search Console issues the token.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${literata.variable} ${instrumentSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <SiteJsonLd />
        <SkipLink />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {clerkEnabled ? <ClerkProvider>{children}</ClerkProvider> : children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        {/* Google Analytics — disclosed in /privacy. */}
        {GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}</Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
