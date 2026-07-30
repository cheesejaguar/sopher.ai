import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { ThemeProvider } from "@/components/theme-provider";
import { SkipLink } from "@/components/ui/skip-link";
import { clerkEnabled } from "@/lib/clerk";
import { SITE_URL, SiteJsonLd } from "@/components/seo/json-ld";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "optional",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  preload: false,
});

const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--ember)",
    colorNeutral: "var(--foreground)",
    colorForeground: "var(--foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorRing: "var(--ring)",
    colorBorder: "var(--border)",
    colorShadow: "var(--background)",
    colorModalBackdrop: "var(--background)",
    fontFamily: "var(--font-archivo), Arial, sans-serif",
    fontFamilyButtons: "var(--font-archivo), Arial, sans-serif",
    fontFamilyMono:
      'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: "0.875rem",
    borderRadius: "0.25rem",
  },
} as const;

/** Under the ~160 characters Google renders; the old one was 244 and got cut. */
const DESCRIPTION =
  "Turn a sentence into a complete, editable book. Sopher plans, drafts, and refines the manuscript while you stay in control.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "sopher.ai — A sentence in. A finished book out.",
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
    title: "sopher.ai — A sentence in. A finished book out.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "sopher.ai — A sentence in. A finished book out.",
    description: DESCRIPTION,
  },
  // Set GOOGLE_SITE_VERIFICATION once Search Console issues the token.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080910" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f8" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const route = (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading sopher.ai"
          className="instrument-canvas grid min-h-dvh place-items-center px-6"
        >
          <div className="instrument-surface-raised w-full max-w-sm p-6">
            <p className="folio-label text-primary">Sopher.ai / loading</p>
            <div className="mt-5 h-px w-full bg-border" aria-hidden="true" />
            <p className="mt-5 text-sm text-muted-foreground">Preparing your writing desk…</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${archivo.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-dvh antialiased [&_.text-primary]:text-[#5130b8] dark:[&_.text-primary]:text-[#b5aaff]">
        <SiteJsonLd />
        <SkipLink />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {clerkEnabled ? (
            <ClerkProvider appearance={clerkAppearance}>{route}</ClerkProvider>
          ) : (
            route
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
