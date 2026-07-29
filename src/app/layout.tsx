import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans, Literata } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import { SkipLink } from "@/components/ui/skip-link";
import { clerkEnabled } from "@/lib/clerk";
import "./globals.css";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://sopher.ai"),
  title: {
    default: "sopher.ai — Any book you can imagine, made for the people you love",
    template: "%s · sopher.ai",
  },
  description:
    "Describe any book in a sentence — a bedtime story where your dog is the superhero, a mystery set on your street, a family memoir — and a team of AI agents plans it, writes every chapter, and edits the whole manuscript while you watch.",
  openGraph: {
    siteName: "sopher.ai",
    type: "website",
    url: "https://sopher.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "sopher.ai — Any book you can imagine, made for the people you love",
    description:
      "Describe the book in a sentence. A team of AI agents plans it, writes every chapter, and edits the whole manuscript while you watch.",
  },
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
        <SkipLink />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {clerkEnabled ? <ClerkProvider>{children}</ClerkProvider> : children}
        </ThemeProvider>
        <Analytics />
        {/* Google Analytics (G-8JGW12KNXP) — disclosed in /privacy. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8JGW12KNXP"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-8JGW12KNXP');
        `}</Script>
      </body>
    </html>
  );
}
