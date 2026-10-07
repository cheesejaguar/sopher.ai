import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

import { ownedBlobHostname } from "./src/lib/security/blob-url";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Explicitly the pre-16.4 prefetch behaviour. Turning this on makes every
  // studio route report auth/URL data read outside <Suspense> as an instant-
  // navigation insight; adopting it means restructuring those routes first.
  partialPrefetching: false,
  typedRoutes: true,
  async headers() {
    const readerHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
      { key: "Cache-Control", value: "private, no-store" },
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      },
    ];
    return [
      { source: "/:path*", headers: securityHeaders() },
      { source: "/r", headers: readerHeaders },
      { source: "/r/:path*", headers: readerHeaders },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      // Only this deployment's Blob store when the build can identify it (see
      // ownedBlobHostname); otherwise any public store, as before.
      { protocol: "https", hostname: ownedBlobHostname() ?? "*.public.blob.vercel-storage.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
    qualities: [75],
  },
};

export default withWorkflow(nextConfig);
