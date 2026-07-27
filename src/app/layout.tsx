import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans, Literata } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
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
    default: "sopher.ai — Your brief. A finished book.",
    template: "%s · sopher.ai",
  },
  description:
    "sopher.ai turns an author's brief into a complete, edited manuscript. A team of AI agents plans, drafts, critiques, and checks continuity — while you watch, guide, and refine.",
  openGraph: {
    siteName: "sopher.ai",
    type: "website",
    url: "https://sopher.ai",
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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {clerkEnabled ? <ClerkProvider>{children}</ClerkProvider> : children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
