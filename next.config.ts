import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
    qualities: [75],
  },
};

export default withWorkflow(nextConfig);
